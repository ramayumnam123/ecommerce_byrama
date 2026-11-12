"""Checkout + orders + payment state machine (docs/06, docs/04 §6-8, §12).

State machine: PENDING → PAID → SHIPPED → DELIVERED; cancel only while
PENDING (stock restored). Captures are idempotent across verify + webhook.
All money math is integer paise; coupons applied at start, never re-applied.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import (
    AppError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationAppError,
)
from app.core.logging import get_logger
from app.core.pagination import Page, PageRequest
from app.models import (
    Address,
    Cart,
    CartItem,
    Coupon,
    CouponRedemption,
    IdempotencyKey,
    Order,
    OrderItem,
    Payment,
    PaymentKind,
    PaymentStatus,
    ProductVariant,
    User,
    OrderStatus,
)
from app.schemas.checkout_schemas import (
    CheckoutStartIn,
    CheckoutStartOut,
    OrderItemOut,
    OrderOut,
    PaymentOut,
    QuoteIn,
    QuoteOut,
    RazorpayBlock,
    VerifyIn,
)
from app.services import cart_service, razorpay_service

logger = get_logger()
settings = get_settings()
RESERVATION_TTL = timedelta(minutes=15)


# ------------------------------------------------------------------ helpers
def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _read_cart(db: AsyncSession, user: User, guest_token: str | None) -> Cart:
    """Merge a dangling guest cart when asked, then return the user's cart row."""
    if guest_token:
        guest_cart = await cart_service.get_cart(db, user_id=None, guest_token=guest_token)
        if guest_cart is not None:
            user_cart = await cart_service.get_cart(db, user_id=user.id, guest_token=None)
            if user_cart is None:
                user_cart = Cart(user_id=user.id)
                db.add(user_cart)
                await db.flush()
            await cart_service.merge_carts(db, user_cart=user_cart, guest_cart_id=guest_cart.id)
    cart = await cart_service.get_cart(db, user_id=user.id, guest_token=None)
    if cart is None:
        raise ValidationAppError("CART_EMPTY", "Your cart is empty")
    return cart


async def _address_of(db: AsyncSession, user: User, address_id: uuid.UUID) -> Address:
    address = await db.scalar(
        select(Address).where(Address.id == address_id, Address.user_id == user.id)
    )
    if address is None:
        raise ValidationAppError("VALIDATION", "Unknown address", details={"address_id": str(address_id)})
    return address


async def validate_coupon(
    db: AsyncSession, user: User, code: str, subtotal: int
) -> tuple[Coupon, int]:
    coupon = await db.scalar(
        select(Coupon).where(func.upper(Coupon.code) == code.upper())
    )
    if coupon is None or not coupon.is_active:
        raise ValidationAppError("COUPON_INVALID", "This coupon is not valid")
    now = _now()
    if coupon.starts_at and now < coupon.starts_at:
        raise ValidationAppError("COUPON_NOT_ACTIVE", "This coupon is not active yet")
    if coupon.expires_at and now > coupon.expires_at:
        raise ValidationAppError("COUPON_EXPIRED", "This coupon has expired")
    if coupon.min_order_value and subtotal < coupon.min_order_value:
        raise ValidationAppError(
            "COUPON_MIN_VALUE",
            f"Minimum order value for this coupon is ₹{coupon.min_order_value / 100:.0f}",
        )
    if coupon.max_uses is not None and coupon.used_count >= coupon.max_uses:
        raise ConflictError("COUPON_EXHAUSTED", "This coupon has no uses left")
    if coupon.per_user_limit:
        mine = await db.scalar(
            select(func.count())
            .select_from(CouponRedemption)
            .where(CouponRedemption.coupon_id == coupon.id, CouponRedemption.user_id == user.id)
        )
        if int(mine or 0) >= coupon.per_user_limit:
            raise ConflictError("COUPON_USED", "You have already used this coupon")

    if coupon.discount_type == "PERCENT":
        discount = (subtotal * coupon.value) // 100
    else:  # FIXED
        discount = min(coupon.value, subtotal)
    return coupon, discount


def compute_totals(subtotal: int, discount: int) -> dict[str, int]:
    """Paise policy (docs/06 §8): coupon floor, remainder into discount; tax flat%."""
    redeemable = max(0, subtotal - discount)
    shipping = 0 if redeemable >= settings.free_shipping_threshold else settings.flat_shipping_fee
    tax = (redeemable * settings.tax_percent) // 100
    return {
        "subtotal": subtotal,
        "discount": discount,
        "shipping_fee": shipping,
        "tax": tax,
        "total": redeemable + shipping + tax,
    }


async def next_order_number(db: AsyncSession) -> str:
    seq = int(await db.scalar(select(func.count()).select_from(Order)) or 0) + 1
    for attempt in range(5):  # tolerate rare concurrent collisions
        candidate = f"EC-{seq + attempt:06d}"
        exists = await db.scalar(select(Order.id).where(Order.order_number == candidate))
        if not exists:
            return candidate
    raise ConflictError("ORDER_NUMBER", "Could not allocate an order number")


# ---------------------------------------------------------------------- quote
async def quote(db: AsyncSession, user: User, body: QuoteIn) -> QuoteOut:
    await _address_of(db, user, body.address_id)
    cart = await cart_service.read_cart(db, await _require_user_cart(db, user))
    subtotal = cart.totals.subtotal
    discount = 0
    coupon_code = None
    if body.coupon_code:
        coupon, discount = await validate_coupon(db, user, body.coupon_code, subtotal)
        coupon_code = coupon.code
    totals = compute_totals(subtotal, discount)
    return QuoteOut(
        currency=settings.currency,
        coupon_code=coupon_code,
        subtotal=totals["subtotal"],
        discount=totals["discount"],
        shipping=totals["shipping_fee"],
        tax=totals["tax"],
        total=totals["total"],
    )


async def _require_user_cart(db: AsyncSession, user: User) -> Cart:
    cart = await cart_service.get_cart(db, user_id=user.id, guest_token=None)
    if cart is None:
        raise ValidationAppError("CART_EMPTY", "Your cart is empty")
    return cart


# ---------------------------------------------------------------------- start
async def start(
    db: AsyncSession, user: User, body: CheckoutStartIn, idempotency_key: str | None
) -> CheckoutStartOut:
    if user.email_verified_at is None:
        raise ForbiddenError("EMAIL_NOT_VERIFIED", "Verify your email before checking out")

    # -- idempotent replay: same key → same order ------------------------------
    if idempotency_key:
        existing = (
            await db.scalars(
                select(IdempotencyKey)
                .options(selectinload(IdempotencyKey.order).selectinload(Order.items))
                .where(IdempotencyKey.user_id == user.id, IdempotencyKey.key == idempotency_key)
            )
        ).first()
        if existing is not None and existing.order is not None:
            payment = await _payment_of(db, existing.order.id)
            if payment is not None and payment.provider_order_id:
                return _start_out(existing.order, payment)

    cart = await _read_cart(db, user, body.guest_token)
    cart_detail = await cart_service.read_cart(db, cart)
    if not cart_detail.items:
        raise ValidationAppError("CART_EMPTY", "Your cart is empty")
    address = await _address_of(db, user, body.address_id)

    subtotal = cart_detail.totals.subtotal
    discount = 0
    coupon: Coupon | None = None
    if body.coupon_code:
        coupon, discount = await validate_coupon(db, user, body.coupon_code, subtotal)
    totals = compute_totals(subtotal, discount)

    # -- reserve stock: lock rows, validate, decrement -------------------------
    variant_ids = [i.product_variant_id for i in cart_detail.items]
    locked_variants = (
        await db.scalars(
            select(ProductVariant)
            .where(ProductVariant.id.in_(variant_ids))
            .with_for_update()
        )
    ).all()
    by_id = {v.id: v for v in locked_variants}
    for item in cart_detail.items:
        variant = by_id.get(item.product_variant_id)
        if variant is None or not variant.is_active:
            raise ValidationAppError("OUT_OF_STOCK", f"'{item.product_name}' is no longer available")
        if variant.stock < item.quantity:
            raise ValidationAppError(
                "OUT_OF_STOCK",
                f"Only {variant.stock} left of '{item.variant_name}'",
                details={"variant_id": str(variant.id), "available": variant.stock},
            )
        variant.stock -= item.quantity

    order = Order(
        order_number=await next_order_number(db),
        user_id=user.id,
        status=OrderStatus.PENDING,
        coupon_id=coupon.id if coupon else None,
        shipping_address=_address_snapshot(user, address),
        reserved_until=_now() + RESERVATION_TTL,
        notes=body.notes,
        **totals,
        currency=settings.currency,
    )
    db.add(order)
    await db.flush()

    for item in cart_detail.items:
        db.add(
            OrderItem(
                order_id=order.id,
                product_variant_id=item.product_variant_id,
                product_name=item.product_name,
                variant_name=item.variant_name,
                sku=item.sku,
                image_url=item.image_url,
                unit_price=item.unit_price,
                quantity=item.quantity,
                line_total=item.line_total,
            )
        )

    payment = Payment(order_id=order.id, amount=totals["total"], provider_order_id="__pending__")
    db.add(payment)

    if coupon is not None:
        cond = (
            Coupon.used_count < coupon.max_uses if coupon.max_uses is not None else True
        )
        bump = await db.execute(
            update(Coupon).where(Coupon.id == coupon.id, cond).values(used_count=Coupon.used_count + 1)
        )
        if coupon.max_uses is not None and bump.rowcount == 0:
            raise ConflictError("COUPON_EXHAUSTED", "This coupon has no uses left")
        db.add(CouponRedemption(coupon_id=coupon.id, user_id=user.id, order_id=order.id))

    if idempotency_key:
        db.add(IdempotencyKey(user_id=user.id, key=idempotency_key, order_id=order.id))

    # order rows are durable from here; the cart is consumed
    await db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
    await db.flush()

    # -- Razorpay order --------------------------------------------------------
    try:
        rzp = await razorpay_service.create_order(
            amount=totals["total"], currency=settings.currency, receipt=order.order_number
        )
    except razorpay_service.RazorpayError as exc:
        logger.bind(order=order.order_number, err=str(exc)).error("razorpay_order_failed")
        raise AppError(
            "GATEWAY_DOWN",
            "Payment gateway is unreachable. Your order is saved — retry payment shortly.",
            details={"order_number": order.order_number},
            status_code=503,
        ) from exc

    payment.provider_order_id = rzp["id"]
    await db.flush()

    # reload with items eager-loaded (fresh posts aren't in the relationship)
    order = (
        await db.scalars(
            select(Order).options(selectinload(Order.items)).where(Order.id == order.id)
        )
    ).first() or order
    return _start_out(order, payment, rzp)


def _address_snapshot(user: User, address: Address) -> dict[str, Any]:
    return {
        "name": user.full_name,
        "line1": address.line1,
        "line2": address.line2,
        "city": address.city,
        "state": address.state,
        "postal_code": address.postal_code,
        "country": address.country,
        "phone": address.phone,
    }


def _start_out(order: Order, payment: Payment, rzp_order: dict[str, Any] | None = None) -> CheckoutStartOut:
    provider_order_id = rzp_order["id"] if rzp_order else payment.provider_order_id
    block = RazorpayBlock(
        order_id=provider_order_id,
        amount=payment.amount,
        currency=order.currency,
        key_id=razorpay_service.key_id(),
        mock=razorpay_service.is_mock(),
    )
    return CheckoutStartOut(order=_order_out(order, payment), razorpay=block)


# ------------------------------------------------------- capture / transitions
async def _payment_of(db: AsyncSession, order_id: uuid.UUID) -> Payment | None:
    return await db.scalar(
        select(Payment).where(
            Payment.order_id == order_id, Payment.kind == PaymentKind.GATEWAY
        )
    )


async def capture(db: AsyncSession, order: Order, payment: Payment, *,
                  provider_payment_id: str | None, provider_signature: str | None,
                  raw_payload: dict[str, Any] | None) -> bool:
    """Idempotent PENDING→PAID transition shared by verify, webhook, mock.

    Returns True when this call performed the transition.
    """
    if order.status == OrderStatus.PAID:
        if payment.status != PaymentStatus.CAPTURED:  # unlikely drift; heal
            payment.status = PaymentStatus.CAPTURED
        return False
    if order.status != OrderStatus.PENDING:
        raise ConflictError("ORDER_STATE", f"Order is {order.status}; expected PENDING")

    payment.status = PaymentStatus.CAPTURED
    payment.provider_payment_id = provider_payment_id
    payment.provider_signature = provider_signature
    if raw_payload:
        payment.raw_payload = raw_payload
    order.status = OrderStatus.PAID
    order.paid_at = _now()
    await db.flush()
    logger.bind(order=order.order_number).info("order_paid")
    return True


async def verify(db: AsyncSession, user: User, body: VerifyIn, *, mock: bool = False) -> OrderOut:
    payment = await db.scalar(
        select(Payment)
        .options(selectinload(Payment.order).selectinload(Order.items))
        .where(Payment.provider_order_id == body.razorpay_order_id,
               Payment.kind == PaymentKind.GATEWAY)
    )
    if payment is None:
        raise NotFoundError()
    order = payment.order
    if order.user_id != user.id and user.role != "ADMIN":
        raise NotFoundError()  # don't leak other users' orders

    if payment.status != PaymentStatus.CAPTURED:
        if mock:
            if not razorpay_service.is_mock():
                raise ForbiddenError()
        elif not razorpay_service.verify_payment_signature(
            body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature
        ):
            raise ValidationAppError("SIGNATURE_MISMATCH", "Payment signature verification failed")

    await capture(
        db, order, payment,
        provider_payment_id=body.razorpay_payment_id,
        provider_signature=body.razorpay_signature,
        raw_payload={"source": "mock_pay" if mock else "checkout_verify"},
    )
    return _order_out(order, payment)


# ------------------------------------------------------------------- webhooks
async def process_webhook(db: AsyncSession, event: str, payload: dict[str, Any]) -> dict[str, Any]:
    payment_entity: dict[str, Any] = payload.get("payment", {}).get("entity", {})
    refund_entity: dict[str, Any] = payload.get("refund", {}).get("entity", {})

    if event == "payment.captured" or event == "order.paid":
        payment = await _by_provider_payment_or_order(db, payment_entity)
        if payment is None:
            return {"handled": False, "reason": "unknown_payment"}
        order = payment.order
        await capture(
            db, order, payment,
            provider_payment_id=payment_entity.get("id"),
            provider_signature=None,
            raw_payload=payload,
        )
        return {"handled": True, "status": order.status}

    if event == "payment.failed":
        payment = await _by_provider_payment_or_order(db, payment_entity)
        if payment is None or payment.status == PaymentStatus.CAPTURED:
            return {"handled": False}
        payment.status = PaymentStatus.FAILED
        if payment_entity.get("id"):
            payment.provider_payment_id = payment_entity["id"]
        payment.raw_payload = payload
        await db.flush()
        # order stays PENDING until TTL — user can retry per docs/06 §4
        return {"handled": True, "status": payment.status}

    if event == "refund.processed":
        return {"handled": False, "reason": "refunds land in Phase 4 admin"}

    return {"handled": False, "reason": "unhandled_event"}


async def _by_provider_payment_or_order(db: AsyncSession, entity: dict[str, Any]) -> Payment | None:
    payment: Payment | None = None
    if entity.get("id"):
        payment = await db.scalar(
            select(Payment)
            .options(selectinload(Payment.order).selectinload(Order.items))
            .where(Payment.provider_payment_id == entity["id"])
        )
    if payment is None and entity.get("order_id"):
        payment = await db.scalar(
            select(Payment)
            .options(selectinload(Payment.order).selectinload(Order.items))
            .where(Payment.provider_order_id == entity["order_id"],
                   Payment.kind == PaymentKind.GATEWAY)
        )
    return payment


# --------------------------------------------------------------------- cancel
async def cancel(db: AsyncSession, user: User, order_id: uuid.UUID) -> OrderOut:
    order = (
        await db.scalars(
            select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
        )
    ).first()
    if order is None or (order.user_id != user.id and user.role != "ADMIN"):
        raise NotFoundError()
    if order.status != OrderStatus.PENDING:
        raise ConflictError("ORDER_STATE", f"Only PENDING orders can be cancelled (order is {order.status})")

    for item in order.items:
        await db.execute(
            update(ProductVariant)
            .where(ProductVariant.id == item.product_variant_id)
            .values(stock=ProductVariant.stock + item.quantity)
        )
    order.status = OrderStatus.CANCELLED
    order.cancelled_at = _now()
    order.reserved_until = None
    payment = await _payment_of(db, order.id)
    if payment is not None and payment.status == PaymentStatus.CREATED:
        payment.status = PaymentStatus.FAILED
    await db.flush()
    return _order_out(order, payment)


# ------------------------------------------------------------------ read side
async def list_my_orders(db: AsyncSession, user: User, *, page: int, page_size: int) -> Page[OrderOut]:
    page_size = min(page_size, 100)
    rows = (
        await db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.user_id == user.id)
            .order_by(Order.created_at.desc())
            .add_columns(func.count().over().label("total"))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    total = int(rows[0].total) if rows else 0
    items: list[OrderOut] = []
    for order, _ in rows:
        payment = await _payment_of(db, order.id)
        items.append(_order_out(order, payment))
    return Page.build(items=items, total=total, req=PageRequest(page=page, page_size=page_size))


async def get_order(db: AsyncSession, user: User, order_id: uuid.UUID) -> OrderOut:
    order = (
        await db.scalars(
            select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
        )
    ).first()
    if order is None or (order.user_id != user.id and user.role != "ADMIN"):
        raise NotFoundError()
    payment = await _payment_of(db, order.id)
    return _order_out(order, payment)


def _order_out(order: Order, payment: Payment | None) -> OrderOut:
    return OrderOut(
        id=order.id,
        order_number=order.order_number,
        status=str(order.status.name if hasattr(order.status, "name") else order.status),
        subtotal=order.subtotal,
        discount=order.discount,
        shipping_fee=order.shipping_fee,
        tax=order.tax,
        total=order.total,
        refund_amount=order.refund_amount,
        currency=order.currency,
        shipping_address=order.shipping_address,
        coupon_id=order.coupon_id,
        notes=order.notes,
        tracking_number=order.tracking_number,
        carrier=order.carrier,
        reserved_until=order.reserved_until,
        paid_at=order.paid_at,
        cancelled_at=order.cancelled_at,
        created_at=order.created_at,
        items=[
            OrderItemOut(
                product_variant_id=i.product_variant_id,
                product_name=i.product_name,
                variant_name=i.variant_name,
                sku=i.sku,
                image_url=i.image_url,
                unit_price=i.unit_price,
                quantity=i.quantity,
                line_total=i.line_total,
            )
            for i in order.items
        ],
        payment=(
            PaymentOut(
                id=payment.id,
                kind=payment.kind.name,
                amount=payment.amount,
                status=payment.status.name,
                provider_order_id=payment.provider_order_id,
                provider_payment_id=payment.provider_payment_id,
            )
            if payment
            else None
        ),
    )
