"""Checkout, order, address schemas (docs/04 §6-8, docs/06)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ------------------------------------------------------------------ addresses
class AddressIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    line1: str = Field(min_length=3, max_length=180)
    line2: str | None = Field(None, max_length=180)
    city: str = Field(min_length=2, max_length=80)
    state: str = Field(min_length=2, max_length=80)
    postal_code: str = Field(min_length=4, max_length=20)
    country: str = Field("IN", min_length=2, max_length=2)
    phone: str = Field(min_length=8, max_length=20)
    is_default: bool = False

    @field_validator("country")
    @classmethod
    def upper_country(cls, v: str) -> str:
        return v.upper()


class AddressUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    line1: str | None = Field(None, min_length=3, max_length=180)
    line2: str | None = Field(None, max_length=180)
    city: str | None = Field(None, min_length=2, max_length=80)
    state: str | None = Field(None, min_length=2, max_length=80)
    postal_code: str | None = Field(None, min_length=4, max_length=20)
    country: str | None = Field(None, min_length=2, max_length=2)
    phone: str | None = Field(None, min_length=8, max_length=20)
    is_default: bool | None = None


class AddressOut(BaseModel):
    id: uuid.UUID
    line1: str
    line2: str | None
    city: str
    state: str
    postal_code: str
    country: str
    phone: str
    is_default: bool


# -------------------------------------------------------------------- checkout
class QuoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    address_id: uuid.UUID
    coupon_code: str | None = Field(None, min_length=2, max_length=32)


class QuoteOut(BaseModel):
    subtotal: int
    discount: int
    shipping: int
    tax: int
    total: int
    currency: str
    coupon_code: str | None = None


class CheckoutStartIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    address_id: uuid.UUID
    coupon_code: str | None = Field(None, min_length=2, max_length=32)
    guest_token: str | None = Field(None, min_length=8, max_length=64)
    notes: str | None = Field(None, max_length=500)


class RazorpayBlock(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: str
    mock: bool = False


class CheckoutStartOut(BaseModel):
    order: "OrderOut"
    razorpay: RazorpayBlock


class VerifyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    razorpay_order_id: str = Field(min_length=4, max_length=64)
    razorpay_payment_id: str = Field(min_length=4, max_length=64)
    razorpay_signature: str = Field(min_length=8, max_length=255)


# ---------------------------------------------------------------------- orders
class OrderItemOut(BaseModel):
    product_variant_id: uuid.UUID
    product_name: str
    variant_name: str
    sku: str
    image_url: str | None
    unit_price: int
    quantity: int
    line_total: int


class PaymentOut(BaseModel):
    id: uuid.UUID
    kind: str
    amount: int
    status: str
    provider_order_id: str
    provider_payment_id: str | None = None


class OrderOut(BaseModel):
    id: uuid.UUID
    order_number: str
    status: str
    subtotal: int
    discount: int
    shipping_fee: int
    tax: int
    total: int
    refund_amount: int
    currency: str
    shipping_address: dict[str, Any]
    coupon_id: uuid.UUID | None = None
    notes: str | None = None
    tracking_number: str | None = None
    carrier: str | None = None
    reserved_until: datetime | None = None
    paid_at: datetime | None = None
    cancelled_at: datetime | None = None
    created_at: datetime
    items: list[OrderItemOut] = Field(default_factory=list)
    payment: PaymentOut | None = None


QuoteOut.model_rebuild()
CheckoutStartOut.model_rebuild()
