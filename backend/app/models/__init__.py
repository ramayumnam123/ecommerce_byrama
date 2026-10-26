"""Model registry import — register all mappers (Alembic/create_all target)."""

from app.db.base import Base
from app.models.address import Address
from app.models.audit_log import AuditLog
from app.models.cart import Cart, CartItem
from app.models.category import Category
from app.models.coupon import Coupon, CouponRedemption
from app.models.enums import (
    DiscountType,
    OrderStatus,
    PaymentKind,
    PaymentStatus,
    TokenPurpose,
    UserRole,
)
from app.models.idempotency import IdempotencyKey
from app.models.order import Order, OrderItem
from app.models.payment import Payment
from app.models.product import Product
from app.models.product_image import ProductImage
from app.models.product_variant import ProductVariant
from app.models.refresh_token import RefreshToken
from app.models.review import Review
from app.models.setting import Setting
from app.models.user import User

__all__ = [
    "Address",
    "AuditLog",
    "Base",
    "Cart",
    "CartItem",
    "Category",
    "Coupon",
    "CouponRedemption",
    "DiscountType",
    "IdempotencyKey",
    "Order",
    "OrderItem",
    "OrderStatus",
    "Payment",
    "PaymentKind",
    "PaymentStatus",
    "Product",
    "ProductImage",
    "ProductVariant",
    "RefreshToken",
    "Review",
    "Setting",
    "TokenPurpose",
    "User",
    "UserRole",
]
