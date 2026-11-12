import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid
from app.models.enums import TokenPurpose

if TYPE_CHECKING:
    from .user import User


class RefreshToken(Base, TimestampMixin):
    """Single-use hashed tokens (docs/05 §3).

    Purposes: REFRESH (rotation), VERIFY_EMAIL, RESET_PASSWORD.
    Raw values are never stored — only SHA-256 hex (see core.security).
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    purpose: Mapped[TokenPurpose] = mapped_column(
        nullable=False, default=TokenPurpose.REFRESH, server_default="REFRESH"
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rotated_from: Mapped[uuid.UUID | None] = mapped_column(nullable=True)

    user: Mapped["User"] = relationship()
