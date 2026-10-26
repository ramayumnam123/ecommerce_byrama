"""Admin-panel schemas (docs/04 §9.1-9.4): products, categories, coupons,
orders management, users admin. Money inputs are integer paise.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ------------------------------------------------------------------ categories
class CategoryCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=120)
    parent_id: uuid.UUID | None = None
    image_url: str | None = Field(None, max_length=400)
    sort_order: int = 0


class CategoryUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=2, max_length=120)
    parent_id: uuid.UUID | None = None
    image_url: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class AdminCategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    parent_id: uuid.UUID | None
    image_url: str | None
    is_active: bool
    sort_order: int
    product_count: int = 0


# -------------------------------------------------------------------- products
class VariantSpecIn(BaseModel):
    """Inline variant for product create."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    sku: str | None = Field(None, max_length=64)
    price: int = Field(gt=0)
    compare_at_price: int | None = Field(None, gt=0)
    stock: int = Field(0, ge=0)
    weight_grams: int | None = Field(None, ge=0)
    attributes: dict[str, Any] = Field(default_factory=dict)

    @field_validator("compare_at_price")
    @classmethod
    def compare_gt_price(cls, v: int | None, info) -> int | None:
        if v is not None and info.data.get("price") is not None and v < info.data["price"]:
            raise ValueError("compare_at_price must be >= price")
        return v


class ImageSpecIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=8, max_length=500)
    alt_text: str | None = Field(None, max_length=200)


class ProductCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=180)
    description: str = ""
    category_id: uuid.UUID
    is_active: bool = True
    images: list[ImageSpecIn] = Field(default_factory=list, max_length=10)
    variants: list[VariantSpecIn] = Field(min_length=1, max_length=50)


class ProductUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=2, max_length=180)
    description: str | None = None
    category_id: uuid.UUID | None = None
    is_active: bool | None = None


class VariantCreateIn(BaseModel):
    """POST /products/{id}/variants."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    sku: str | None = Field(None, max_length=64)
    price: int = Field(gt=0)
    compare_at_price: int | None = Field(None, gt=0)
    stock: int = Field(0, ge=0)
    weight_grams: int | None = Field(None, ge=0)
    attributes: dict[str, Any] = Field(default_factory=dict)

    @field_validator("compare_at_price")
    @classmethod
    def compare_gt_price(cls, v: int | None, info) -> int | None:
        if v is not None and info.data.get("price") is not None and v < info.data["price"]:
            raise ValueError("compare_at_price must be >= price")
        return v


class VariantUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=120)
    sku: str | None = Field(None, max_length=64)
    price: int | None = Field(None, gt=0)
    compare_at_price: int | None = None  # explicit null clears it
    stock: int | None = Field(None, ge=0)
    weight_grams: int | None = None
    attributes: dict[str, Any] | None = None
    is_active: bool | None = None


class ImagesReorderIn(BaseModel):
    """Entries with `id` update existing rows; entries with `url` attach new ones."""

    model_config = ConfigDict(extra="forbid")

    images: list[ImageSpecIn] = Field(max_length=10)


class AdminVariantOut(BaseModel):
    id: uuid.UUID
    name: str
    sku: str
    price: int
    compare_at_price: int | None
    stock: int
    weight_grams: int | None
    attributes: dict[str, Any]
    is_active: bool
    sold_units: int = 0


class AdminImageOut(BaseModel):
    id: uuid.UUID
    url: str
    alt_text: str | None
    sort_order: int


class AdminProductListItem(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    category_id: uuid.UUID
    is_active: bool
    deleted_at: datetime | None
    min_price: int
    total_stock: int
    variant_count: int
    image_url: str | None
    created_at: datetime


class AdminProductDetail(AdminProductListItem):
    description: str
    updated_at: datetime
    variants: list[AdminVariantOut]
    images: list[AdminImageOut]


# --------------------------------------------------------------------- coupons
class CouponCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    discount_type: str = Field(pattern="^(PERCENT|FIXED)$")
    value: int = Field(gt=0)
    min_order_value: int | None = Field(None, ge=0)
    max_uses: int | None = Field(None, gt=0)
    per_user_limit: int = Field(1, ge=0)
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    is_active: bool = True

    @field_validator("value")
    @classmethod
    def value_bounds(cls, v: int, info) -> int:
        if info.data.get("discount_type") == "PERCENT" and not (1 <= v <= 100):
            raise ValueError("PERCENT value must be 1..100")
        return v

    @field_validator("code")
    @classmethod
    def upper_code(cls, v: str) -> str:
        return v.upper()


class CouponUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: int | None = Field(None, gt=0)
    min_order_value: int | None = Field(None, ge=0)
    max_uses: int | None = None
    per_user_limit: int | None = Field(None, ge=0)
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    is_active: bool | None = None


class AdminCouponOut(BaseModel):
    id: uuid.UUID
    code: str
    discount_type: str
    value: int
    min_order_value: int | None
    max_uses: int | None
    used_count: int
    per_user_limit: int
    starts_at: datetime | None
    expires_at: datetime | None
    is_active: bool
    created_at: datetime


class CouponUsageOut(BaseModel):
    order_id: uuid.UUID
    order_number: str
    user_email: str
    discount_amount: int
    created_at: datetime


# ---------------------------------------------------------------------- orders
class AdminOrderOut(BaseModel):
    id: uuid.UUID
    order_number: str
    status: str
    user: "AdminUserBrief"
    subtotal: int
    discount: int
    shipping_fee: int
    tax: int
    total: int
    refund_amount: int
    currency: str
    coupon_id: uuid.UUID | None
    notes: str | None
    admin_note: str | None
    tracking_number: str | None
    carrier: str | None
    reserved_until: datetime | None
    paid_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    item_count: int = 0


class AdminUserBrief(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str


class AdminOrderDetail(AdminOrderOut):
    shipping_address: dict[str, Any]
    items: list[dict[str, Any]]
    payment: dict[str, Any] | None


class OrderStatusPatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = Field(pattern="^(SHIPPED|DELIVERED|CANCELLED)$")
    tracking_number: str | None = Field(None, max_length=64)
    carrier: str | None = Field(None, max_length=40)
    admin_note: str | None = Field(None, max_length=1000)


class RefundIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: int = Field(gt=0)  # paise
    reason: str | None = Field(None, max_length=500)


# ----------------------------------------------------------------------- users
class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    email_verified: bool
    created_at: datetime
    orders_count: int = 0


class AdminUserPatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool | None = None
    role: str | None = Field(None, pattern="^(CUSTOMER|ADMIN)$")


# ----------------------------------------------------------------------- audit
# ----------------------------------------------------------------------- audit
class MediaPresignIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str = Field(min_length=1, max_length=240)
    content_type: str = Field(pattern="^(image/jpeg|image/png|image/webp)$")


class AdminAuditOut(BaseModel):
    id: uuid.UUID
    actor_email: str | None
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    diff: dict[str, Any]
    ip: str | None
    request_id: str | None
    created_at: datetime


AdminOrderOut.model_rebuild()
AdminOrderDetail.model_rebuild()
