"""Admin order management (docs/04 §9.3, docs/06 §6, docs/08 §5).

Transitions (server-enforced):
  PENDING → CANCELLED (restock)
  PAID → SHIPPED | CANCELLED (gateway full-refund + restock)
  SHIPPED → DELIVERED
  DELIVERED → final
  REFUNDED/CANCELLED → read-only
Refund: PAID/SHIPPED/DELIVERED, amount ≤ total − refunded; full refund refunds
stock back when it happens pre-shipment.
"""

import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import Page, PageRequest
from app.models import (
    Coupon,
    CouponRedemption,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentKind,
    PaymentStatus,
    ProductVariant,
    User,
)
from app.schemas.admin_schemas import (
    AdminOrderDetail,
    AdminOrderOut,
    AdminUserBrief,
    CouponUsageOut,
    OrderStatusPatchIn,
    RefundIn,
)
from app.services import razorpay_service
from app.services.audit_service import audit

ALLOWED_FROM: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.PENDING: {OrderStatus.CANCELLED},
    OrderStatus.PAID: {OrderStatus.SHIPPED, OrderStatus.CANCELLED},
    OrderStatus.SHIPPED: {OrderStatus.DELIVERED},
    OrderStatus.DELIVERED: set(),
    OrderStatus.REFUNDED: set(),
    OrderStatus.CANCELLED: set(),
}

PRE_SHIPMENT_STATUSES = {OrderStatus.PENDING, OrderStatus.PAID}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _status_of(value: str) -> OrderStatus:
    try:
        return OrderStatus(value)
    except ValueError:
        raise ValidationAppError("VALIDATION", f"Unknown status '{value}'")


def _int_of(v: Any) -> int:
    return int(v or 0)


async def _item_counts(db: AsyncSession, order_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not order_ids:
        return {}
    rows = (
        (await db.execute(
            select(OrderItem.order_id, func.sum(OrderItem.quantity))
            .where(OrderItem.order_id.in_(order_ids))
            .group_by(OrderItem.order_id)
        )).all()
    )
    return {oid: _int_of(n) for oid, n in rows}


# ----------------------------------------------------------------------- list
async def list_orders(
    db: AsyncSession,
    *,
    status: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> Page[AdminOrderOut]:
    page_size = min(page_size, 100)
    conditions = []
    if status:
        conditions.append(Order.status == _status_of(status))
    if date_from is not None:
        conditions.append(Order.created_at >= date_from)
    if date_to is not None:
        conditions.append(Order.created_at < date_to)

    count_stmt = select(func.count()).select_from(Order)
    if q:
        sub = (
            select(Order.id)
            .join(User, User.id == Order.user_id)
            .where(*conditions, Order.order_number.ilike(f"%{q.strip()}%") | User.email.ilike(f"%{q.strip()}%"))
            .subquery()
        )
        count_stmt = select(func.count()).select_from(sub)
        stmt = (
            select(Order, User)
            .join(User, User.id == Order.user_id)
            .where(*conditions, Order.order_number.ilike(f"%{q.strip()}%") | User.email.ilike(f"%{q.strip()}%"))
        )
    else:
        count_stmt = count_stmt.where(*conditions)
        stmt = (
            select(Order, User)
            .join(User, User.id == Order.user_id)
            .where(*conditions)
        )

    total = int(await db.scalar(count_stmt) or 0)
    rows = (await db.execute(stmt.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    counts = await _item_counts(db, [o.id for o, _ in rows])

    items = [_order_out(o, u, counts.get(o.id, 0)) for o, u in rows]
    return Page.build(items=items, total=total, req=PageRequest(page=page, page_size=page_size))


def _order_out(o: Order, u: User, item_count: int) -> AdminOrderOut:
    return AdminOrderOut(
        id=o.id,
        order_number=o.order_number,
        status=o.status.name,
        user=AdminUserBrief(id=u.id, email=u.email, full_name=u.full_name),
        subtotal=_int_of(o.subtotal),
        discount=_int_of(o.discount),
        shipping_fee=_int_of(o.shipping_fee),
        tax=_int_of(o.tax),
        total=_int_of(o.total),
        refund_amount=_int_of(o.refund_amount),
        currency=o.currency,
        coupon_id=o.coupon_id,
        notes=o.notes,
        admin_note=o.admin_note,
        tracking_number=o.tracking_number,
        carrier=o.carrier,
        reserved_until=o.reserved_until,
        paid_at=o.paid_at,
        cancelled_at=o.cancelled_at,
        created_at=o.created_at,
        item_count=item_count,
    )


def _item_dict(i: OrderItem) -> dict[str, Any]:
    return {
        "product_variant_id": str(i.product_variant_id),
        "product_name": i.product_name,
        "variant_name": i.variant_name,
        "sku": i.sku,
        "image_url": i.image_url,
        "unit_price": _int_of(i.unit_price),
        "quantity": i.quantity,
        "line_total": _int_of(i.line_total),
    }


def _payment_dict(p: Payment) -> dict[str, Any]:
    return {
        "id": str(p.id),
        "kind": p.kind.name,
        "amount": _int_of(p.amount),
        "status": p.status.name,
        "provider_order_id": p.provider_order_id,
        "provider_payment_id": p.provider_payment_id,
        "raw_payload": p.raw_payload,
    }


# ---------------------------------------------------------------------- detail
async def _load_order(db: AsyncSession, order_id: uuid.UUID) -> Order:
    o = (
        await db.scalars(
            select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
        )
    ).first()
    if o is None:
        raise NotFoundError()
    return o


async def get_order_admin(db: AsyncSession, order_id: uuid.UUID) -> AdminOrderDetail:
    o = await _load_order(db, order_id)
    u = await db.scalar(select(User).where(User.id == o.user_id))
    payments = (await db.scalars(select(Payment).where(Payment.order_id == o.id))).all()

    base = _order_out(o, u, sum(i.quantity for i in o.items))
    gateway = next((p for p in payments if p.kind == PaymentKind.GATEWAY), None)
    primary = gateway or (payments[0] if payments else None)
    return AdminOrderDetail(
        **base.model_dump(),
        shipping_address=o.shipping_address,
        items=[_item_dict(i) for i in o.items],
        payment=_payment_dict(primary) if primary else None,
    )


# ------------------------------------------------------------------ transitions
async def set_status(
    db: AsyncSession, admin: User, order_id: uuid.UUID, body: OrderStatusPatchIn, request
) -> AdminOrderDetail:
    o = await _load_order(db, order_id)
    target = _status_of(body.status)
    allowed = ALLOWED_FROM[o.status]
    if target not in allowed:
        allowed_names = ", ".join(sorted(s.name for s in allowed)) or "none"
        raise ConflictError(
            "ORDER_STATE",
            f"Illegal transition {o.status.name} -> {target.name} (allowed: {allowed_names})",
        )

    from_status = o.status.name
    if body.tracking_number:
        o.tracking_number = body.tracking_number
    if body.carrier:
        o.carrier = body.carrier
    if body.admin_note:
        o.admin_note = body.admin_note

    if target == OrderStatus.CANCELLED:
        if o.status == OrderStatus.PAID:
            await _gateway_full_refund(db, o)
        await _restore_stock(db, o)
        payment = await _gateway_payment(db, o.id)
        if payment is not None and payment.status == PaymentStatus.CREATED:
            payment.status = PaymentStatus.FAILED
        o.status = OrderStatus.CANCELLED
        o.cancelled_at = o.cancelled_at or _utcnow()
        o.reserved_until = None
    else:
        o.status = target
    await db.flush()

    await audit(
        db, actor=admin, action=f"order.{target.name.lower()}",
        entity_type="order", entity_id=o.id,
        diff={"from": from_status, "to": target.name,
              "tracking_number": body.tracking_number, "carrier": body.carrier},
        request=request,
    )
    return await get_order_admin(db, o.id)


async def _gateway_payment(db: AsyncSession, order_id: uuid.UUID) -> Payment | None:
    return await db.scalar(
        select(Payment).where(Payment.order_id == order_id, Payment.kind == PaymentKind.GATEWAY)
    )


async def _restore_stock(db: AsyncSession, order: Order) -> None:
    for item in order.items:
        await db.execute(
            update(ProductVariant)
            .where(ProductVariant.id == item.product_variant_id)
            .values(stock=ProductVariant.stock + item.quantity)
        )


async def _gateway_full_refund(db: AsyncSession, order: Order) -> None:
    """Cancel-PAID path: refund everything through the gateway."""
    payment = await _gateway_payment(db, order.id)
    if payment is None or payment.status != PaymentStatus.CAPTURED or not payment.provider_payment_id:
        return  # nothing captured — plain cancel/restock
    try:
        gateway_result = await razorpay_service.refund_payment(payment.provider_payment_id, int(order.total))
    except razorpay_service.RazorpayError as exc:
        raise ValidationAppError("REFUND_FAILED", f"Gateway refund failed: {exc}")
    payment.status = PaymentStatus.REFUNDED
    refund_ref = str((gateway_result or {}).get("id") or f"rfnd_{order.order_number}")
    grant = await db.scalar(
        select(Payment).where(Payment.order_id == order.id, Payment.kind == PaymentKind.REFUND)
    )
    if grant is None:
        db.add(Payment(
            order_id=order.id, kind=PaymentKind.REFUND, provider="razorpay",
            provider_order_id=f"refund_{order.order_number}",
            provider_payment_id=refund_ref,  # unique per refund (gateway payment id is taken by the GATEWAY row)
            amount=int(order.total), status=PaymentStatus.REFUNDED,
            raw_payload={"reason": "admin cancel", "gateway": gateway_result or {}},
        ))
    else:
        grant.amount += int(order.total)
        grant.status = PaymentStatus.REFUNDED
    order.refund_amount += int(order.total)


# ---------------------------------------------------------------------- refund
async def refund(
    db: AsyncSession, admin: User, order_id: uuid.UUID, body: RefundIn, request
) -> AdminOrderDetail:
    o = await _load_order(db, order_id)
    if o.status == OrderStatus.PENDING:
        raise ConflictError("ORDER_STATE", "Pending orders are cancelled, not refunded")
    if o.status not in (OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED):
        raise ConflictError(
            "ORDER_STATE", f"Order is {o.status.name}; refunds need a captured payment"
        )

    refundable = _int_of(o.total) - _int_of(o.refund_amount)
    if body.amount > refundable:
        raise ValidationAppError(
            "VALIDATION", f"Refund amount exceeds the refundable balance ({refundable} paise)"
        )

    payment = await _gateway_payment(db, o.id)
    if payment is None or not payment.provider_payment_id:
        raise ConflictError("ORDER_STATE", "No captured gateway payment on this order")
    try:
        gateway_result = await razorpay_service.refund_payment(payment.provider_payment_id, body.amount)
    except razorpay_service.RazorpayError as exc:
        raise ValidationAppError("REFUND_FAILED", f"Gateway refund failed: {exc}")

    grant = await db.scalar(
        select(Payment).where(Payment.order_id == o.id, Payment.kind == PaymentKind.REFUND)
    )
    if grant is None:
        db.add(Payment(
            order_id=o.id, kind=PaymentKind.REFUND, provider="razorpay",
            provider_order_id=f"refund_{o.order_number}",
            provider_payment_id=str((gateway_result or {}).get("id") or f"rfnd_{o.order_number}"),
            amount=body.amount, status=PaymentStatus.REFUNDED,
            raw_payload={"reason": body.reason, "gateway": gateway_result or {}},
        ))
    else:
        grant.amount += body.amount
        grant.raw_payload = {"reason": body.reason, "gateway": gateway_result or {}}
    o.refund_amount += body.amount

    was_pre_shipment = o.status in PRE_SHIPMENT_STATUSES
    if o.refund_amount >= _int_of(o.total):
        o.status = OrderStatus.REFUNDED
        payment.status = PaymentStatus.REFUNDED
        if was_pre_shipment:
            await _restore_stock(db, o)
    await db.flush()

    await audit(
        db, actor=admin, action="order.refund", entity_type="order", entity_id=o.id,
        diff={"amount": body.amount, "reason": body.reason}, request=request,
    )
    return await get_order_admin(db, o.id)


# ---------------------------------------------------------------------- coupons
async def coupon_usages(
    db: AsyncSession, coupon_id: uuid.UUID, *, page: int, page_size: int
) -> Page[CouponUsageOut]:
    page_size = min(page_size, 100)
    if not await db.scalar(select(Coupon.id).where(Coupon.id == coupon_id)):
        raise NotFoundError()

    base = (
        select(CouponRedemption.created_at.label("r_created"), Order, User)
        .join(Order, Order.id == CouponRedemption.order_id)
        .join(User, User.id == Order.user_id)
        .where(CouponRedemption.coupon_id == coupon_id)
    )
    total = int(
        await db.scalar(
            select(func.count()).select_from(CouponRedemption)
            .where(CouponRedemption.coupon_id == coupon_id)
        ) or 0
    )
    rows = (
        await db.execute(
            base.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).all()
    items = [
        CouponUsageOut(
            order_id=o.id, order_number=o.order_number, user_email=u.email,
            discount_amount=_int_of(o.discount), created_at=r_created,
        )
        for r_created, o, u in rows
    ]
    return Page.build(items=items, total=total, req=PageRequest(page=page, page_size=page_size))
