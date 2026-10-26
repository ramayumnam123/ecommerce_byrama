"""Cart schemas (docs/04 §5)."""

import uuid

from pydantic import BaseModel, ConfigDict, Field


class CartItemOut(BaseModel):
    product_variant_id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    product_slug: str
    variant_name: str
    sku: str
    unit_price: int
    quantity: int
    line_total: int
    image_url: str | None = None
    in_stock: bool
    stock: int


class CartTotalsOut(BaseModel):
    subtotal: int
    total_items: int


class CartOut(BaseModel):
    items: list[CartItemOut]
    totals: CartTotalsOut


class AddCartItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_variant_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=99)


class UpdateCartItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: int = Field(ge=0, le=99)  # 0 = remove line


class MergeCartIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    guest_token: str = Field(min_length=8, max_length=64)
