"""Payment records (docs/03 §2 payments): gateway rows + refund rows."""

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, ForeignKey, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Enum as SaEnum

from app.db.base import Base, TimestampMixin, new_uuid
from app.models.enums import PaymentKind, PaymentStatus

if TYPE_CHECKING:
    from .order import Order

kind_enum = SaEnum(PaymentKind, native_enum=False, validate_strings=True, length=32)
status_enum = SaEnum(PaymentStatus, native_enum=False, validate_strings=True, length=32)


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("order_id", "kind", name="uq_payments_order_kind"),  # one refund simplified v1
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_uuid)
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[PaymentKind] = mapped_column(
        kind_enum, nullable=False, default=PaymentKind.GATEWAY, server_default="GATEWAY"
    )
    provider: Mapped[str] = mapped_column(String(16), nullable=False, default="razorpay", server_default="razorpay")
    provider_order_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    provider_payment_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    provider_signature: Mapped[str | None] = mapped_column(String, nullable=True)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)  # paise
    status: Mapped[PaymentStatus] = mapped_column(
        status_enum, nullable=False, default=PaymentStatus.CREATED, server_default="CREATED"
    )
    raw_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )

    order: Mapped["Order"] = relationship()
