"""Razorpay Orders API client + dual-channel signature verification (docs/06).

Mock mode: when no key_id is configured (local dev / CI), the service runs in
`mock` mode — provider rows are synthesized locally and `/checkout/mock-pay`
can simulate a capture so the full order lifecycle is e2e-testable without
network access. Never available when real keys are configured.
"""

import hashlib
import hmac
import uuid
from typing import Any

import httpx

from app.core.config import get_settings

API_BASE = "https://api.razorpay.com/v1"
MOCK_TTL_SECONDS = 15 * 60


def is_mock() -> bool:
    return not get_settings().razorpay_key_id


def key_id() -> str:
    return get_settings().razorpay_key_id or "rzp_test_mock"


def payment_signature(order_id: str, payment_id: str) -> str:
    """HMAC-SHA256 of `{order_id}|{payment_id}` with the key secret."""
    secret = get_settings().razorpay_key_secret
    digest = hmac.new(
        secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()
    return digest


def verify_payment_signature(order_id: str, payment_id: str, signature: str) -> bool:
    return hmac.compare_digest(payment_signature(order_id, payment_id), signature)


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    secret = get_settings().razorpay_webhook_secret
    if not secret or not signature:
        return False
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


class RazorpayError(Exception):
    def __init__(self, message: str, status: int = 0, payload: dict | None = None):
        super().__init__(message)
        self.status = status
        self.payload = payload or {}


def mock_order_id() -> str:
    return f"order_mock_{uuid.uuid4().hex[:16]}"


def mock_payment_id() -> str:
    return f"pay_mock_{uuid.uuid4().hex[:16]}"


async def create_order(*, amount: int, currency: str, receipt: str) -> dict[str, Any]:
    """POST /orders. amount is integer paise. Returns the provider order dict."""
    if is_mock():
        return {
            "id": mock_order_id(),
            "amount": amount,
            "currency": currency,
            "receipt": receipt,
            "status": "created",
        }

    settings = get_settings()
    try:
        async with httpx.AsyncClient(
            base_url=API_BASE,
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
            timeout=30,
        ) as client:
            resp = await client.post(
                "/orders",
                json={"amount": amount, "currency": currency, "receipt": receipt},
            )
    except httpx.HTTPError as exc:
        raise RazorpayError(f"razorpay unreachable: {exc}") from exc

    if resp.status_code >= 400:
        try:
            payload: dict[str, Any] = resp.json()
        except ValueError:
            payload = {"raw": resp.text[:500]}
        raise RazorpayError(
            payload.get("error", {}).get("description") or "razorpay order rejected",
            status=resp.status_code,
            payload=payload,
        )
    out: dict[str, Any] = resp.json()
    return out


async def refund_payment(provider_payment_id: str, amount_paise: int) -> dict[str, Any]:
    """POST /payments/{id}/refund — admin refunds (Phase 4 consumer)."""
    if is_mock():
        return {"id": f"rfnd_mock_{uuid.uuid4().hex[:12]}", "amount": amount_paise}
    settings = get_settings()
    try:
        async with httpx.AsyncClient(
            base_url=API_BASE,
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
            timeout=30,
        ) as client:
            resp = await client.post(
                f"/payments/{provider_payment_id}/refund",
                json={"amount": amount_paise},
            )
    except httpx.HTTPError as exc:
        raise RazorpayError(f"razorpay unreachable: {exc}") from exc
    if resp.status_code >= 400:
        try:
            payload = resp.json()
        except ValueError:
            payload = {"raw": resp.text[:500]}
        raise RazorpayError(
            payload.get("error", {}).get("description") or "refund rejected",
            status=resp.status_code,
            payload=payload,
        )
    out: dict[str, Any] = resp.json()
    return out
