"""Checkout routes (docs/04 §7, docs/06 §3/§5).

`Idempotency-Key` header on /start makes replays return the original order.
`/mock-pay` exists ONLY in mock mode (no Razorpay keys configured) so the full
PENDING→PAID lifecycle including stock decrement and coupon redemption can be
exercised in tests/dev without network access.
"""

from fastapi import APIRouter, Header, Response, status

from app.core.deps import DbDep, UserDep
from app.core.exceptions import ForbiddenError, ValidationAppError
from app.routers import API_PREFIX
from app.schemas.checkout_schemas import (
    CheckoutStartIn,
    CheckoutStartOut,
    OrderOut,
    QuoteIn,
    QuoteOut,
    VerifyIn,
)
from app.services import order_service, razorpay_service

router = APIRouter(prefix=f"{API_PREFIX}/checkout", tags=["checkout"])


@router.post("/quote", response_model=QuoteOut)
async def quote(body: QuoteIn, user: UserDep, db: DbDep) -> QuoteOut:
    return await order_service.quote(db, user, body)


@router.post("/start", response_model=CheckoutStartOut, status_code=status.HTTP_200_OK)
async def start(
    body: CheckoutStartIn,
    user: UserDep,
    db: DbDep,
    response: Response,
    idempotency_key: str | None = Header(default=None),
) -> CheckoutStartOut:
    return await order_service.start(db, user, body, idempotency_key)


@router.post("/verify", response_model=OrderOut)
async def verify(body: VerifyIn, user: UserDep, db: DbDep) -> OrderOut:
    """Client-callback safety net (webhook stays authoritative)."""
    return await order_service.verify(db, user, body)


@router.post("/mock-pay", response_model=OrderOut)
async def mock_pay(
    razorpay_order_id: str, user: UserDep, db: DbDep
) -> OrderOut:
    """Dev/test-only capture simulator (no real keys configured)."""
    if not razorpay_service.is_mock():
        raise ForbiddenError("FORBIDDEN", "mock-pay requires unset Razorpay keys")
    if len(razorpay_order_id) < 4 or not razorpay_order_id.startswith("order_mock_"):
        raise ValidationAppError("VALIDATION", "Invalid mock order id")
    return await order_service.verify(
        db,
        user,
        VerifyIn(
            razorpay_order_id=razorpay_order_id,
            razorpay_payment_id=razorpay_service.mock_payment_id(),
            razorpay_signature="mock-signature",
        ),
        mock=True,
    )
