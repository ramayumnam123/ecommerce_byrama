"""Shared DB enums. Values == names to avoid SQLAlchemy name/value drift."""
from enum import Enum


class UserRole(str, Enum):
    CUSTOMER = "CUSTOMER"
    ADMIN = "ADMIN"


class TokenPurpose(str, Enum):
    REFRESH = "REFRESH"
    VERIFY_EMAIL = "VERIFY_EMAIL"
    RESET_PASSWORD = "RESET_PASSWORD"


class DiscountType(str, Enum):
    PERCENT = "PERCENT"
    FIXED = "FIXED"


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class PaymentKind(str, Enum):
    GATEWAY = "GATEWAY"
    REFUND = "REFUND"


class PaymentStatus(str, Enum):
    CREATED = "CREATED"
    CAPTURED = "CAPTURED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


def str_enum(enum_cls: type[Enum]) -> object:
    """VARCHAR-backed enum (no native PG types → simpler migrations)."""
    from sqlalchemy import Enum as SaEnum

    return SaEnum(enum_cls, native_enum=False, validate_strings=True, length=32)
