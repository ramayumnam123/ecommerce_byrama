"""Expired-reservation sweeper (docs/01 risk table, docs/02 §6).

PENDING orders hold reserved stock for RESERVATION_TTL minutes. Anything past
its `reserved_until` is cancelled exactly like a customer cancel: stock is
returned, the payment row goes FAILED, `reserved_until` clears.

In this deployment the ARQ/Redis job runner isn't installed, so the loop runs
inside the API process (asyncio task started by the lifespan); the same
`sweep_once` is also exposed as an admin maintenance endpoint — which mirrors
doc 08's "run the reconciliation job now" admin hook. Swapping to ARQ later
means calling sweep_once from the worker instead.
"""

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging import get_logger
from app.models import Order, OrderStatus, Payment, PaymentKind, PaymentStatus, ProductVariant

logger = get_logger()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def sweep_once(db: AsyncSession) -> int:
    """Cancels every expired PENDING reservation. Returns how many."""
    expired = (
        await db.scalars(
            select(Order)
            .options(selectinload(Order.items))
            .where(
                Order.status == OrderStatus.PENDING,
                Order.reserved_until.is_not(None),
                Order.reserved_until <= _utcnow(),
            )
            .order_by(Order.reserved_until)
        )
    ).all()
    if not expired:
        return 0

    for order in expired:
        for item in order.items:
            await db.execute(
                update(ProductVariant)
                .where(ProductVariant.id == item.product_variant_id)
                .values(stock=ProductVariant.stock + item.quantity)
            )
        order.status = OrderStatus.CANCELLED
        order.cancelled_at = _utcnow()
        order.reserved_until = None
        payment = await db.scalar(
            select(Payment).where(Payment.order_id == order.id, Payment.kind == PaymentKind.GATEWAY)
        )
        if payment is not None and payment.status == PaymentStatus.CREATED:
            payment.status = PaymentStatus.FAILED
        logger.bind(order_number=order.order_number).info("reservation_expired")
    await db.flush()
    return len(expired)


async def sweep_loop(interval_seconds: int) -> None:
    """Lifespan task: sweep every `interval_seconds`, one session per pass."""
    import asyncio

    from app.db.session import SessionLocal

    while True:
        await asyncio.sleep(interval_seconds)
        try:
            async with SessionLocal() as db:
                swept = await sweep_once(db)
                if swept:
                    await db.commit()
                    logger.info("reservation_sweep", swept=swept)
        except Exception:  # pragma: no cover - defensive loop guard
            logger.exception("reservation_sweep_failed")
