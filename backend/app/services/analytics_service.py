"""Analytics service (docs/04 §9.5, docs/08 §3 — authoritative SQL).

Revenue basis: orders with status PAID/SHIPPED/DELIVERED whose paid_at falls
inside the window. Summary revenue nets out partial refunds; all windows come
with equal-length preceding-window deltas. Missing calendar days are filled
with zeros so charts never skip days.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationAppError
from app.models import (
    Category,
    Order,
    OrderItem,
    OrderStatus,
    ProductVariant,
    User,
    UserRole,
)
from app.schemas.analytics_schemas import (
    CustomerGrowthOut,
    DeltasOut,
    LowStockOut,
    RevenueDayOut,
    SalesByCategoryOut,
    SummaryOut,
    TopProductOut,
)

PAID_STATUSES = {OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED}
PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90}
MAX_CUSTOM_SPAN_DAYS = 366
LOW_STOCK_LIMIT = 50


def resolve_window(
    period: str | None, from_: datetime | None, to: datetime | None
) -> tuple[datetime, datetime]:
    """Returns [from, to) in UTC. `to` defaults to now for fixed periods."""
    if (period in (None, "custom")) and (from_ is None or to is None):
        raise ValidationAppError(
            "VALIDATION", "custom period requires both from and to"
        )
    if period == "custom":
        if to <= from_:
            raise ValidationAppError("VALIDATION", "to must be after from")
        if to - from_ > timedelta(days=MAX_CUSTOM_SPAN_DAYS):
            raise ValidationAppError(
                "VALIDATION", f"custom span is capped at {MAX_CUSTOM_SPAN_DAYS} days"
            )
        return from_, to
    days = PERIOD_DAYS.get(period or "30d", 30)
    to_dt = to or datetime.now(timezone.utc)
    return to_dt - timedelta(days=days), to_dt


def _int_of(v) -> int:
    return int(v or 0)


async def _window_aggregates(
    db: AsyncSession, from_: datetime, to: datetime
) -> dict[str, float]:
    revenue_orders = await db.execute(
        select(
            func.sum(Order.total - func.coalesce(Order.refund_amount, 0)),
            func.count(),
            func.count(func.distinct(Order.user_id)),
        ).where(
            Order.status.in_(PAID_STATUSES),
            Order.paid_at >= from_,
            Order.paid_at < to,
        )
    )
    revenue, orders_count, customers = revenue_orders.one()
    units = await db.scalar(
        select(func.sum(OrderItem.quantity))
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.status.in_(PAID_STATUSES),
            Order.paid_at >= from_,
            Order.paid_at < to,
        )
    )
    return {
        "revenue": _int_of(revenue),
        "orders_count": _int_of(orders_count),
        "customers": _int_of(customers),
        "units_sold": _int_of(units),
    }


def _pct(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


# --------------------------------------------------------------------- summary
async def summary(
    db: AsyncSession, from_: datetime, to: datetime
) -> SummaryOut:
    cur = await _window_aggregates(db, from_, to)
    span = to - from_
    prev = await _window_aggregates(db, from_ - span, from_)
    aov = cur["revenue"] // cur["orders_count"] if cur["orders_count"] else 0
    prev_aov = (
        prev["revenue"] // prev["orders_count"] if prev["orders_count"] else 0
    )
    return SummaryOut(
        revenue=cur["revenue"],
        orders_count=cur["orders_count"],
        aov=aov,
        units_sold=cur["units_sold"],
        customers=cur["customers"],
        conversion_placeholder=None,
        deltas_vs_prev=DeltasOut(
            revenue=_pct(cur["revenue"], prev["revenue"]),
            orders_count=_pct(cur["orders_count"], prev["orders_count"]),
            aov=_pct(aov, prev_aov),
            units_sold=_pct(cur["units_sold"], prev["units_sold"]),
            customers=_pct(cur["customers"], prev["customers"]),
        ),
    )


# -------------------------------------------------------------- revenue by day
def _day_str(day: datetime) -> str:
    return day.strftime("%Y-%m-%d")


def _fill_days(
    from_: datetime, to: datetime, rows: dict[str, tuple[int, int]]
) -> list[RevenueDayOut]:
    """Zero-fill every missing calendar day between from_ and to."""
    days: list[RevenueDayOut] = []
    day = from_.astimezone(timezone.utc).replace(hour=0, minute=0, second=0)
    last = to.astimezone(timezone.utc).replace(hour=0, minute=0, second=0)
    while day <= last:
        revenue, orders = rows.get(_day_str(day), (0, 0))
        days.append(RevenueDayOut(date=_day_str(day), revenue=revenue, orders=orders))
        day += timedelta(days=1)
    return days


async def revenue_by_day(
    db: AsyncSession, from_: datetime, to: datetime
) -> list[RevenueDayOut]:
    day = func.date_trunc("day", Order.paid_at)
    rows = (
        await db.execute(
            select(
                day.label("d"),
                func.sum(Order.total).label("revenue"),
                func.count().label("orders"),
            )
            .where(
                Order.status.in_(PAID_STATUSES),
                Order.paid_at >= from_,
                Order.paid_at < to,
            )
            .group_by(day.label("d"))
            .order_by(day.label("d"))
        )
    ).all()
    bucket = {
        _day_str(d): (_int_of(revenue), _int_of(orders)) for d, revenue, orders in rows
    }
    return _fill_days(from_, to, bucket)


# ---------------------------------------------------------------- top products
async def top_products(
    db: AsyncSession, from_: datetime, to: datetime, limit: int = 10
) -> list[TopProductOut]:
    rows = (
        await db.execute(
            select(
                ProductVariant.product_id,
                OrderItem.product_name,
                func.sum(OrderItem.quantity),
                func.sum(OrderItem.line_total),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .join(ProductVariant, ProductVariant.id == OrderItem.product_variant_id)
            .where(
                Order.status.in_(PAID_STATUSES),
                Order.paid_at >= from_,
                Order.paid_at < to,
            )
            .group_by(ProductVariant.product_id, OrderItem.product_name)
            .order_by(func.sum(OrderItem.line_total).desc())
            .limit(limit)
        )
    ).all()
    return [
        TopProductOut(
            product_id=product_id, name=name, units=_int_of(units), revenue=_int_of(revenue)
        )
        for product_id, name, units, revenue in rows
    ]


# ---------------------------------------------------------- sales by category
async def sales_by_category(
    db: AsyncSession, from_: datetime, to: datetime
) -> list[SalesByCategoryOut]:
    from app.models import Product

    rows = (
        await db.execute(
            select(
                Category.name,
                func.sum(OrderItem.line_total),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .join(ProductVariant, ProductVariant.id == OrderItem.product_variant_id)
            .join(Product, Product.id == ProductVariant.product_id)
            .outerjoin(Category, Category.id == Product.category_id)
            .where(
                Order.status.in_(PAID_STATUSES),
                Order.paid_at >= from_,
                Order.paid_at < to,
            )
            .group_by(Category.name)
            .order_by(func.sum(OrderItem.line_total).desc())
        )
    ).all()
    total = sum(_int_of(revenue) for _, revenue in rows)
    return [
        SalesByCategoryOut(
            category=name or "Uncategorised",
            revenue=_int_of(revenue),
            share=round(_int_of(revenue) / total * 100, 1) if total else 0.0,
        )
        for name, revenue in rows
    ]


# ------------------------------------------------------------ customer growth
async def customer_growth(
    db: AsyncSession, from_: datetime, to: datetime
) -> list[CustomerGrowthOut]:
    day = func.date_trunc("day", User.created_at)
    rows = (
        await db.execute(
            select(day.label("d"), func.count())
            .where(
                User.role == UserRole.CUSTOMER,
                User.created_at >= from_,
                User.created_at < to,
            )
            .group_by(day.label("d"))
            .order_by(day.label("d"))
        )
    ).all()
    counts = {_day_str(d): _int_of(n) for d, n in rows}
    out: list[CustomerGrowthOut] = []
    running = 0
    day_ptr = from_.astimezone(timezone.utc).replace(hour=0, minute=0, second=0)
    last = to.astimezone(timezone.utc).replace(hour=0, minute=0, second=0)
    while day_ptr <= last:
        label = _day_str(day_ptr)
        running += counts.get(label, 0)
        out.append(
            CustomerGrowthOut(
                date=label, new_customers=counts.get(label, 0), cumulative=running
            )
        )
        day_ptr += timedelta(days=1)
    return out


# ------------------------------------------------------------------- low stock
async def low_stock(db: AsyncSession, threshold: int = 5) -> list[LowStockOut]:
    from app.models import Product

    rows = (
        await db.execute(
            select(ProductVariant.id, ProductVariant.sku, Product.name, ProductVariant.stock)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(
                ProductVariant.is_active,
                Product.is_active,
                Product.deleted_at.is_(None),
                ProductVariant.stock < threshold,
            )
            .order_by(ProductVariant.stock.asc(), Product.name.asc())
            .limit(LOW_STOCK_LIMIT)
        )
    ).all()
    return [
        LowStockOut(variant_id=vid, sku=sku, product_name=name, stock=_int_of(stock))
        for vid, sku, name, stock in rows
    ]
