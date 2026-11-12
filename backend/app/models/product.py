import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid

if TYPE_CHECKING:
    from .category import Category
    from .product_image import ProductImage
    from .product_variant import ProductVariant


class Product(Base, TimestampMixin):
    __tablename__ = "products"
    __table_args__ = (
        # full-text search index (docs/03 §2; trigram/ILIKE fuzzy index omitted
        # until a fuzzy-search need is validated on real data)
        Index(
            "ix_products_fts",
            text("to_tsvector('english', name || ' ' || description)"),
            postgresql_using="gin",
        ),
        Index("ix_products_active_created", "is_active", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    category: Mapped["Category"] = relationship(back_populates="products")
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", passive_deletes=True
    )
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", passive_deletes=True,
        order_by="ProductImage.sort_order",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"Product(id={self.id!r}, slug={self.slug!r})"
