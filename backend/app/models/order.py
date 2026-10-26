"""Orders (immutable snapshots) + items (docs/03 §2, §4 invariants)."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid
from app.models.enums import OrderStatus
from sqlalchemy import Enum as SaEnum

status_enum = SaEnum(OrderStatus, native_enum=False, validate_strings=True, length=32)

if TYPE_CHECKING:
    from .coupon import Coupon
    from .user import User


class Order(Base, TimestampMixin):
    __tablename__ = "orders"
    __table_args__ = (
        Index("ix_orders_active_created", "status", "created_at"),
        Index(
            "ix_orders_pending_ttl",
            "reserved_until",
            postgresql_where=text("status = 'PENDING'"),
        ),
        Index("ix_orders_paid_at", "paid_at"),
        Index("ix_orders_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_uuid)
    order_number: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[OrderStatus] = mapped_column(
        status_enum, nullable=False, default=OrderStatus.PENDING, server_default="PENDING"
    )

    # money (paise, integers)
    subtotal: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    discount: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    shipping_fee: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    tax: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    total: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    refund_amount: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR", server_default="INR")

    coupon_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("coupons.id", ondelete="SET NULL"), nullable=True
    )
    shipping_address: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    # stock reservation TTL (15 min from checkout)
    reserved_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # fulfilment
    shipping_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    tracking_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    carrier: Mapped[str | None] = mapped_column(String(40), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship()
    coupon: Mapped["Coupon | None"] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", passive_deletes=True
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"Order(id={self.id!r}, number={self.order_number!r}, status={self.status!r})"


class OrderItem(Base, TimestampMixin):
    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_uuid)
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    product_variant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=False
    )

    # ---- immutable purchase-time snapshots ----
    product_name: Mapped[str] = mapped_column(String(180), nullable=False)
    variant_name: Mapped[str] = mapped_column(String(120), nullable=False)
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    unit_price: Mapped[int] = mapped_column(BigInteger, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[int] = mapped_column(BigInteger, nullable=False)

    order: Mapped["Order"] = relationship(back_populates="items")
