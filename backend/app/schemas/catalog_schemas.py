"""Catalog + review schemas (docs/04 §4)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ProductImageOut(BaseModel):
    url: str
    alt_text: str | None = None
    sort_order: int = 0


class ProductVariantOut(BaseModel):
    id: uuid.UUID
    name: str
    sku: str
    price: int
    compare_at_price: int | None = None
    stock: int
    attributes: dict[str, Any]


class CategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    image_url: str | None = None
    children: list["CategoryOut"] = Field(default_factory=list)


class RatingOut(BaseModel):
    average: float | None = None
    count: int = 0


class ProductListItem(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    category_slug: str | None = None
    min_price: int
    compare_at_price: int | None = None
    image_url: str | None = None
    total_stock: int = 0
    in_stock: bool = False
    rating: RatingOut = RatingOut()


class ProductDetail(ProductListItem):
    description: str
    created_at: datetime
    variants: list[ProductVariantOut]
    images: list[ProductImageOut]


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str | None = Field(None, max_length=140)
    body: str | None = Field(None, max_length=5000)


class MyReviewOut(BaseModel):
    """A user's own review, with product info for the account page."""

    id: uuid.UUID
    rating: int
    title: str | None
    body: str | None
    is_verified_purchase: bool
    created_at: datetime
    product_id: uuid.UUID
    product_slug: str
    product_name: str


class ReviewOut(BaseModel):
    id: uuid.UUID
    rating: int
    title: str | None
    body: str | None
    user_name: str
    is_verified_purchase: bool
    created_at: datetime
