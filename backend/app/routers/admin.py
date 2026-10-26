"""Admin API (docs/04 §9.1-9.6). All endpoints require ADMIN role; every
mutation is audit-logged. Analytics endpoints pass through `resolve_window`.
"""

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, status

from app.core.deps import AdminDep, DbDep
from app.core.pagination import Page
from app.routers import API_PREFIX
from app.schemas.admin_schemas import (
    AdminAuditOut,
    AdminCategoryOut,
    AdminCouponOut,
    AdminOrderDetail,
    AdminOrderOut,
    AdminProductDetail,
    AdminProductListItem,
    AdminUserOut,
    CategoryCreateIn,
    CategoryUpdateIn,
    CouponCreateIn,
    CouponUsageOut,
    CouponUpdateIn,
    ImagesReorderIn,
    OrderStatusPatchIn,
    ProductCreateIn,
    ProductUpdateIn,
    RefundIn,
    VariantCreateIn,
    VariantUpdateIn,
    AdminUserPatchIn,
)
from app.schemas.analytics_schemas import (
    CustomerGrowthOut,
    LowStockOut,
    RevenueDayOut,
    SalesByCategoryOut,
    SummaryOut,
    TopProductOut,
)
from app.services import (
    admin_users_service,
    analytics_service,
    order_admin_service,
    product_admin_service,
)
from sqlalchemy import func, select

from app.models import AuditLog, User

router = APIRouter(prefix=f"{API_PREFIX}/admin", tags=["admin"])
PERIOD_PATTERN = r"^(7d|30d|90d|custom)$"


# ------------------------------------------------------------------- analytics
def _analytics_deps(
    period: str | None,
    from_: datetime | None,
    to: datetime | None,
) -> tuple[datetime, datetime]:
    return analytics_service.resolve_window(period, from_, to)


@router.get("/analytics/summary", response_model=SummaryOut)
async def analytics_summary(
    period: str | None = Query("30d", pattern=PERIOD_PATTERN),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> SummaryOut:
    lo, hi = _analytics_deps(period, from_, to)
    return await analytics_service.summary(db, lo, hi)


@router.get("/analytics/revenue-by-day", response_model=list[RevenueDayOut])
async def analytics_revenue_by_day(
    period: str | None = Query("30d", pattern=PERIOD_PATTERN),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> list[RevenueDayOut]:
    lo, hi = _analytics_deps(period, from_, to)
    return await analytics_service.revenue_by_day(db, lo, hi)


@router.get("/analytics/top-products", response_model=list[TopProductOut])
async def analytics_top_products(
    period: str | None = Query("30d", pattern=PERIOD_PATTERN),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> list[TopProductOut]:
    lo, hi = _analytics_deps(period, from_, to)
    return await analytics_service.top_products(db, lo, hi)


@router.get("/analytics/sales-by-category", response_model=list[SalesByCategoryOut])
async def analytics_sales_by_category(
    period: str | None = Query("30d", pattern=PERIOD_PATTERN),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> list[SalesByCategoryOut]:
    lo, hi = _analytics_deps(period, from_, to)
    return await analytics_service.sales_by_category(db, lo, hi)


@router.get("/analytics/customer-growth", response_model=list[CustomerGrowthOut])
async def analytics_customer_growth(
    period: str | None = Query("30d", pattern=PERIOD_PATTERN),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> list[CustomerGrowthOut]:
    lo, hi = _analytics_deps(period, from_, to)
    return await analytics_service.customer_growth(db, lo, hi)


@router.get("/analytics/low-stock", response_model=list[LowStockOut])
async def analytics_low_stock(
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> list[LowStockOut]:
    return await analytics_service.low_stock(db)


# ------------------------------------------------------------------- products
@router.get("/products", response_model=Page[AdminProductListItem])
async def admin_list_products(
    include_deleted: bool = False,
    q: str | None = Query(None, max_length=100),
    category_id: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 20,
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> Page[AdminProductListItem]:
    return await product_admin_service.list_products(
        db, include_deleted=include_deleted, q=q, category_id=category_id,
        page=page, page_size=page_size,
    )


@router.post("/products", response_model=AdminProductDetail, status_code=status.HTTP_201_CREATED)
async def admin_create_product(
    body: ProductCreateIn, request: Request, user: AdminDep, db: DbDep
) -> AdminProductDetail:
    out = await product_admin_service.create_product(db, body)
    await _audit(db, user, "product.create", "product", out.id, {"name": out.name}, request)
    return out


@router.get("/products/{product_id}", response_model=AdminProductDetail)
async def admin_get_product(product_id: uuid.UUID, user: AdminDep, db: DbDep) -> AdminProductDetail:
    return await product_admin_service.get_product(db, product_id)


@router.patch("/products/{product_id}", response_model=AdminProductDetail)
async def admin_update_product(
    product_id: uuid.UUID, body: ProductUpdateIn, request: Request, user: AdminDep, db: DbDep
) -> AdminProductDetail:
    out = await product_admin_service.update_product(db, product_id, body)
    await _audit(db, user, "product.update", "product", product_id,
                 body.model_dump(exclude_unset=True), request)
    return out


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_product(
    product_id: uuid.UUID, request: Request, user: AdminDep, db: DbDep
) -> None:
    await product_admin_service.soft_delete_product(db, product_id)
    await _audit(db, user, "product.soft_delete", "product", product_id, None, request)


@router.post("/products/{product_id}/variants", response_model=AdminProductDetail, status_code=201)
async def admin_add_variant(
    product_id: uuid.UUID, body: VariantCreateIn, request: Request, user: AdminDep, db: DbDep
) -> AdminProductDetail:
    out = await product_admin_service.add_variant(db, product_id, body)
    await _audit(db, user, "variant.create", "product", product_id,
                 {"sku": dict(body.model_dump(exclude={"attributes": True})).get("sku")}, request)
    return out


@router.patch("/products/variants/{variant_id}", response_model=AdminProductDetail)
async def admin_update_variant(
    variant_id: uuid.UUID, body: VariantUpdateIn, request: Request, user: AdminDep, db: DbDep
) -> AdminProductDetail:
    out = await product_admin_service.update_variant(db, variant_id, body)
    await _audit(db, user, "variant.update", "variant", variant_id,
                 body.model_dump(exclude_unset=True), request)
    return out


@router.delete("/products/variants/{variant_id}", status_code=204)
async def admin_delete_variant(
    variant_id: uuid.UUID, request: Request, user: AdminDep, db: DbDep
) -> None:
    await product_admin_service.delete_variant(db, variant_id)
    await _audit(db, user, "variant.delete", "variant", variant_id, None, request)


@router.post("/products/{product_id}/images", response_model=AdminProductDetail)
async def admin_set_images(
    product_id: uuid.UUID, body: ImagesReorderIn, request: Request, user: AdminDep, db: DbDep
) -> AdminProductDetail:
    out = await product_admin_service.replace_images(db, product_id, body.images)
    await _audit(db, user, "product.images", "product", product_id,
                 {"count": len(body.images)}, request)
    return out


# ----------------------------------------------------------------- categories
@router.get("/categories", response_model=list[AdminCategoryOut])
async def admin_list_categories(user: AdminDep, db: DbDep) -> list[AdminCategoryOut]:
    return await product_admin_service.list_categories(db)


@router.post("/categories", response_model=AdminCategoryOut, status_code=201)
async def admin_create_category(
    body: CategoryCreateIn, request: Request, user: AdminDep, db: DbDep
) -> AdminCategoryOut:
    out = await product_admin_service.create_category(db, body)
    await _audit(db, user, "category.create", "category", out.id, {"name": out.name}, request)
    return out


@router.patch("/categories/{category_id}", response_model=AdminCategoryOut)
async def admin_update_category(
    category_id: uuid.UUID, body: CategoryUpdateIn, request: Request, user: AdminDep, db: DbDep
) -> AdminCategoryOut:
    out = await product_admin_service.update_category(db, category_id, body)
    await _audit(db, user, "category.update", "category", category_id,
                 body.model_dump(exclude_unset=True), request)
    return out


@router.delete("/categories/{category_id}", status_code=204)
async def admin_delete_category(
    category_id: uuid.UUID, request: Request, user: AdminDep, db: DbDep
) -> None:
    await product_admin_service.delete_category(db, category_id)
    await _audit(db, user, "category.delete", "category", category_id, None, request)


# -------------------------------------------------------------------- coupons
@router.get("/coupons", response_model=Page[AdminCouponOut])
async def admin_list_coupons(
    page: int = 1,
    page_size: int = 50,
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> Page[AdminCouponOut]:
    return await admin_users_service.list_coupons(db, page=page, page_size=page_size)


@router.post("/coupons", response_model=AdminCouponOut, status_code=201)
async def admin_create_coupon(
    body: CouponCreateIn, request: Request, user: AdminDep, db: DbDep
) -> AdminCouponOut:
    return await admin_users_service.create_coupon(db, user, body, request)


@router.patch("/coupons/{coupon_id}", response_model=AdminCouponOut)
async def admin_update_coupon(
    coupon_id: uuid.UUID, body: CouponUpdateIn, request: Request, user: AdminDep, db: DbDep
) -> AdminCouponOut:
    return await admin_users_service.update_coupon(db, user, coupon_id, body, request)


@router.delete("/coupons/{coupon_id}", status_code=204)
async def admin_delete_coupon(
    coupon_id: uuid.UUID, request: Request, user: AdminDep, db: DbDep
) -> None:
    await admin_users_service.delete_coupon(db, user, coupon_id, request)


@router.get("/coupons/{coupon_id}/usages", response_model=Page[CouponUsageOut])
async def admin_coupon_usages(
    coupon_id: uuid.UUID,
    page: int = 1,
    page_size: int = 20,
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> Page[CouponUsageOut]:
    return await order_admin_service.coupon_usages(
        db, coupon_id, page=page, page_size=page_size
    )


# --------------------------------------------------------------------- orders
@router.get("/orders", response_model=Page[AdminOrderOut])
async def admin_list_orders(
    status_filter: str | None = Query(None, alias="status", pattern="^(PENDING|PAID|SHIPPED|DELIVERED|CANCELLED|REFUNDED)$"),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    q: str | None = Query(None, max_length=100),
    page: int = 1,
    page_size: int = 20,
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> Page[AdminOrderOut]:
    return await order_admin_service.list_orders(
        db, status=status_filter, date_from=date_from, date_to=date_to, q=q,
        page=page, page_size=page_size,
    )


@router.get("/orders/{order_id}", response_model=AdminOrderDetail)
async def admin_get_order(order_id: uuid.UUID, user: AdminDep, db: DbDep) -> AdminOrderDetail:
    return await order_admin_service.get_order_admin(db, order_id)


@router.patch("/orders/{order_id}/status", response_model=AdminOrderDetail)
async def admin_set_order_status(
    order_id: uuid.UUID, body: OrderStatusPatchIn, request: Request, user: AdminDep, db: DbDep
) -> AdminOrderDetail:
    return await order_admin_service.set_status(db, user, order_id, body, request)


@router.post("/orders/{order_id}/refund", response_model=AdminOrderDetail)
async def admin_refund_order(
    order_id: uuid.UUID, body: RefundIn, request: Request, user: AdminDep, db: DbDep
) -> AdminOrderDetail:
    return await order_admin_service.refund(db, user, order_id, body, request)


# ---------------------------------------------------------------------- users
@router.get("/users", response_model=Page[AdminUserOut])
async def admin_list_users(
    q: str | None = Query(None, max_length=100),
    role: str | None = Query(None, pattern="^(CUSTOMER|ADMIN)$"),
    is_active: bool | None = None,
    created_after: datetime | None = None,
    page: int = 1,
    page_size: int = 20,
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> Page[AdminUserOut]:
    return await admin_users_service.list_users(
        db, q=q, role=role, is_active=is_active, created_after=created_after,
        page=page, page_size=page_size,
    )


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def admin_patch_user(
    user_id: uuid.UUID,
    body: AdminUserPatchIn,
    request: Request,
    user: AdminDep,
    db: DbDep,
) -> AdminUserOut:
    return await admin_users_service.patch_user(db, user, user_id, body, request)


# ---------------------------------------------------------------------- audit
@router.get("/audit", response_model=Page[AdminAuditOut])
async def admin_list_audit(
    entity_type: str | None = None,
    action: str | None = None,
    page: int = 1,
    page_size: int = 20,
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> Page[AdminAuditOut]:
    page_size = min(page_size, 100)
    conds = []
    if entity_type:
        conds.append(AuditLog.entity_type == entity_type)
    if action:
        conds.append(AuditLog.action == action)
    count_stmt = select(func.count()).select_from(AuditLog)
    if conds:
        count_stmt = count_stmt.where(*conds)
    total = int(await db.scalar(count_stmt) or 0)
    stmt = select(AuditLog, User.email)
    if conds:
        stmt = stmt.where(*conds)
    rows = (
        await db.execute(
            stmt.join(User, User.id == AuditLog.actor_user_id, isouter=True)
            .order_by(AuditLog.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [
        AdminAuditOut(
            id=log.id, actor_email=email, action=log.action,
            entity_type=log.entity_type, entity_id=log.entity_id,
            diff=log.diff, ip=log.ip, request_id=log.request_id,
            created_at=log.created_at,
        )
        for log, email in rows
    ]
    from app.core.pagination import PageRequest

    return Page.build(items=items, total=total, req=PageRequest(page=page, page_size=page_size))


# ------------------------------------------------------------------ maintenance
@router.post("/maintenance/reservations/sweep")
async def admin_sweep_reservations(
    request: Request, user: AdminDep, db: DbDep
) -> dict:
    """Run the expired-reservation sweep on demand (doc 08 §6 hook)."""
    from app.services import reservation_sweeper

    swept = await reservation_sweeper.sweep_once(db)
    await _audit(db, user, "maintenance.reservation_sweep", "order", None,
                 {"swept": swept}, request)
    return {"swept": swept}


async def _audit(db, user: User, action: str, entity_type: str, entity_id: Any, diff: dict | None, request: Request) -> None:
    """Router-level audit for mutations whose service doesn't audit itself."""
    from app.services.audit_service import audit

    await audit(db, actor=user, action=action, entity_type=entity_type,
                entity_id=entity_id, diff=diff, request=request)
