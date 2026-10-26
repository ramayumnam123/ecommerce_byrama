"""Admin coupon + user management (docs/04 §9.2, §9.4, docs/08 §2)."""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import Page, PageRequest
from app.models import Coupon, Order, User, UserRole
from app.models.enums import DiscountType
from app.schemas.admin_schemas import (
    AdminCouponOut,
    AdminUserOut,
    AdminUserPatchIn,
    CouponCreateIn,
    CouponUpdateIn,
)
from app.services.audit_service import audit


def _int_of(v: Any) -> int:
    return int(v or 0)


def _coupon_out(c: Coupon) -> AdminCouponOut:
    dtype = c.discount_type
    dtype_name = dtype.name if isinstance(dtype, DiscountType) else DiscountType(dtype).name
    return AdminCouponOut(
        id=c.id,
        code=c.code,
        discount_type=dtype_name,
        value=int(c.value),
        min_order_value=_int_or_none(c.min_order_value),
        max_uses=c.max_uses,
        used_count=c.used_count,
        per_user_limit=c.per_user_limit,
        starts_at=c.starts_at,
        expires_at=c.expires_at,
        is_active=c.is_active,
        created_at=c.created_at,
    )


def _int_or_none(v: Any) -> int | None:
    return int(v) if v is not None else None


async def list_coupons(
    db: AsyncSession, *, page: int = 1, page_size: int = 50
) -> Page[AdminCouponOut]:
    page_size = min(page_size, 100)
    total = int(await db.scalar(select(func.count()).select_from(Coupon)) or 0)
    rows = (
        await db.scalars(select(Coupon).order_by(Coupon.created_at.desc())
                         .offset((page - 1) * page_size).limit(page_size))
    ).all()
    return Page.build(
        items=[_coupon_out(c) for c in rows],
        total=total,
        req=PageRequest(page=page, page_size=page_size),
    )


async def create_coupon(db: AsyncSession, admin: User, body: CouponCreateIn, request) -> AdminCouponOut:
    code = body.code.upper()
    if await db.scalar(select(Coupon.id).where(Coupon.code == code)):
        raise ConflictError("CODE_TAKEN", f"Coupon code '{code}' already exists")
    if body.expires_at and body.starts_at and body.expires_at <= body.starts_at:
        raise ValidationAppError("VALIDATION", "expires_at must be after starts_at")
    c = Coupon(
        code=code,
        discount_type=DiscountType(body.discount_type),
        value=body.value,
        min_order_value=body.min_order_value,
        max_uses=body.max_uses,
        per_user_limit=body.per_user_limit,
        starts_at=body.starts_at,
        expires_at=body.expires_at,
        is_active=body.is_active,
    )
    db.add(c)
    await db.flush()
    await audit(db, actor=admin, action="coupon.create", entity_type="coupon", entity_id=c.id,
                diff={"code": code, "value": body.value}, request=request)
    return _coupon_out(c)


async def update_coupon(
    db: AsyncSession, admin: User, coupon_id: uuid.UUID, body: CouponUpdateIn, request
) -> AdminCouponOut:
    c = await db.scalar(select(Coupon).where(Coupon.id == coupon_id))
    if c is None:
        raise NotFoundError()
    patch = body.model_dump(exclude_unset=True)
    if "value" in patch and c.discount_type.name == "PERCENT" and not (1 <= patch["value"] <= 100):
        raise ValidationAppError("VALIDATION", "PERCENT value must be 1..100")
    for field, value in patch.items():
        setattr(c, field, value)
    await db.flush()
    await audit(db, actor=admin, action="coupon.update", entity_type="coupon", entity_id=c.id,
                diff=patch, request=request)
    return _coupon_out(c)


async def delete_coupon(db: AsyncSession, admin: User, coupon_id: uuid.UUID, request) -> None:
    """Deactivate-over-delete once used (docs/04 §9.2)."""
    c = await db.scalar(select(Coupon).where(Coupon.id == coupon_id))
    if c is None:
        raise NotFoundError()
    if c.used_count > 0:
        raise ConflictError(
            "COUPON_IN_USE", f"'{c.code}' has {c.used_count} redemptions — deactivate it instead"
        )
    await audit(db, actor=admin, action="coupon.delete", entity_type="coupon", entity_id=c.id,
                diff={"code": c.code}, request=request)
    await db.execute(update(Coupon).where(Coupon.id == coupon_id).values(is_active=False, code=f"__deleted__{c.code[:24]}"))
    await db.flush()


# ------------------------------------------------------------------------ users
async def list_users(
    db: AsyncSession,
    *,
    q: str | None = None,
    role: str | None = None,
    is_active: bool | None = None,
    created_after: datetime | None = None,
    page: int = 1,
    page_size: int = 20,
) -> Page[AdminUserOut]:
    page_size = min(page_size, 100)
    conds = []
    if q:
        like = f"%{q.strip()}%"
        conds.append(User.email.ilike(like) | User.full_name.ilike(like))
    if role:
        conds.append(User.role == UserRole(role))
    if is_active is not None:
        conds.append(User.is_active == is_active)
    if created_after is not None:
        conds.append(User.created_at >= created_after)

    count_stmt = select(func.count()).select_from(User)
    if conds:
        count_stmt = count_stmt.where(*conds)
    total = int(await db.scalar(count_stmt) or 0)

    stmt = select(User)
    if conds:
        stmt = stmt.where(*conds)
    rows = (
        (await db.scalars(
            stmt.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )).all()
    )
    counts = await _order_counts(db, [u.id for u in rows])
    return Page.build(
        items=[
            AdminUserOut(
                id=u.id, email=u.email, full_name=u.full_name, role=u.role.name,
                is_active=u.is_active, email_verified=u.email_verified_at is not None,
                created_at=u.created_at, orders_count=counts.get(u.id, 0),
            )
            for u in rows
        ],
        total=total,
        req=PageRequest(page=page, page_size=page_size),
    )


async def _order_counts(db: AsyncSession, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not user_ids:
        return {}
    rows = (
        (await db.execute(
            select(Order.user_id, func.count()).where(Order.user_id.in_(user_ids)).group_by(Order.user_id)
        )).all()
    )
    return {uid: _int_of(n) for uid, n in rows}


async def patch_user(
    db: AsyncSession, admin: User, user_id: uuid.UUID, body: AdminUserPatchIn, request
) -> AdminUserOut:
    u = await db.scalar(select(User).where(User.id == user_id))
    if u is None:
        raise NotFoundError()
    patch = body.model_dump(exclude_unset=True)
    if patch.get("role") and u.id == admin.id and patch["role"] != UserRole.ADMIN.value:
        raise ConflictError("SELF_DEMOTE", "You cannot change your own role below ADMIN")
    if patch.get("role") == "CUSTOMER":
        patch["role"] = UserRole.CUSTOMER
    if patch.get("role") == "ADMIN":
        patch["role"] = UserRole.ADMIN

    for field, value in patch.items():
        setattr(u, field, value)
    await db.flush()
    await audit(db, actor=admin, action="user.update", entity_type="user", entity_id=u.id, diff=patch, request=request)
    count = int(await db.scalar(select(func.count()).select_from(Order).where(Order.user_id == u.id)) or 0)
    return AdminUserOut(
        id=u.id, email=u.email, full_name=u.full_name, role=u.role.name,
        is_active=u.is_active, email_verified=u.email_verified_at is not None,
        created_at=u.created_at, orders_count=count,
    )
