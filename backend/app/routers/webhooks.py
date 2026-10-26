"""Razorpay webhook receiver (docs/06 §4).

Order of handling: verify signature over raw bytes → parse → idempotent state
transition → 200 always (for verified events). 400 only on signature failure;
missing webhook secret → 503 so Razorpay retries after config lands.
"""

from fastapi import APIRouter, Request, status

from app.core.config import get_settings
from app.core.exceptions import AppError, ValidationAppError
from app.routers import API_PREFIX
from app.services import razorpay_service

router = APIRouter(prefix=f"{API_PREFIX}/webhooks", tags=["webhooks"])


@router.post("/razorpay", status_code=status.HTTP_200_OK)
async def razorpay_webhook(request: Request) -> dict:
    settings_obj = get_settings()
    if not settings_obj.razorpay_webhook_secret:
        raise AppError(
            "CONFIG_MISSING",
            "Webhook secret not configured",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    signature = request.headers.get("x-razorpay-signature", "")
    raw = await request.body()
    if not razorpay_service.verify_webhook_signature(raw, signature):
        raise ValidationAppError("SIGNATURE_MISMATCH", "Invalid webhook signature")

    body = await request.json()
    event = str(body.get("event", ""))
    payload: dict = body.get("payload", {})

    # a dedicated session: webhooks arrive outside the request session flow
    from app.db.session import SessionLocal
    from app.services import order_service

    async with SessionLocal() as db:
        try:
            result = await order_service.process_webhook(db, event, payload)
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    return {"received": True, **result}
