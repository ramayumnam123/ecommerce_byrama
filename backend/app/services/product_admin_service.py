"""Admin catalog management (docs/04 §9.1): products, variants, images,
categories — soft delete, never-sold rule, slug uniqueness.
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.pagination import Page, PageRequest
from app.models import CartItem, Category, OrderItem, Product, ProductImage, ProductVariant
from app.schemas.admin_schemas import (
    AdminCategoryOut,
    AdminImageOut,
    AdminProductDetail,
    AdminProductListItem,
    AdminVariantOut,
    CategoryCreateIn,
    CategoryUpdateIn,
    ImageSpecIn,
    ProductCreateIn,
    ProductUpdateIn,
    VariantCreateIn,
    VariantUpdateIn,
)
from app.utils.slugify import slugify, unique_slug


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _int_of(v: Any) -> int:
    return int(v or 0)


async def _unique_sku(db: AsyncSession, base_name: str) -> str:
    base = f"{slugify(base_name).upper().replace('-', '')[:10]}-"
    for _ in range(20):
        candidate = f"{base}{uuid.uuid4().hex[:8].upper()}"
        if not await db.scalar(select(ProductVariant.id).where(ProductVariant.sku == candidate)):
            return candidate
    raise ConflictError("SKU", "Could not generate a unique SKU")


# ----------------------------------------------------------------------- list
def _list_stmt(include_deleted: bool, q: str | None, category_id: uuid.UUID | None):
    v_agg = (
        select(
            ProductVariant.product_id.label("pid"),
            func.min(ProductVariant.price).label("min_price"),
            func.sum(ProductVariant.stock).label("total_stock"),
            func.count(ProductVariant.id).label("variant_count"),
        )
        .group_by(ProductVariant.product_id)
        .subquery()
    )
    stmt = (
        select(Product, v_agg.c.min_price, v_agg.c.total_stock, v_agg.c.variant_count)
        .join(Category, Category.id == Product.category_id)
        .outerjoin(v_agg, v_agg.c.pid == Product.id)
    )
    if not include_deleted:
        stmt = stmt.where(Product.deleted_at.is_(None))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(Product.name.ilike(like) | Product.slug.ilike(like))
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    return stmt


async def list_products(
    db: AsyncSession,
    *,
    include_deleted: bool = False,
    q: str | None = None,
    category_id: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> Page[AdminProductListItem]:
    page_size = min(page_size, 100)
    stmt = _list_stmt(include_deleted, q, category_id).order_by(Product.created_at.desc())

    count_stmt = select(func.count()).select_from(
        stmt.order_by(None).with_only_columns(Product.id).subquery()
    )
    total = int(await db.scalar(count_stmt) or 0)

    rows = (
        await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))
    ).all()
    product_ids = [r[0].id for r in rows]
    images = await _first_images(db, product_ids)

    items = [
        AdminProductListItem(
            id=p.id,
            name=p.name,
            slug=p.slug,
            category_id=p.category_id,
            is_active=p.is_active,
            deleted_at=p.deleted_at,
            min_price=_int_of(min_price),
            total_stock=_int_of(total_stock),
            variant_count=_int_of(variant_count),
            image_url=images.get(p.id),
            created_at=p.created_at,
        )
        for p, min_price, total_stock, variant_count in rows
    ]
    return Page.build(items=items, total=total, req=PageRequest(page=page, page_size=page_size))


async def _first_images(db: AsyncSession, product_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not product_ids:
        return {}
    rows = (
        (await db.execute(
            select(ProductImage.product_id, ProductImage.url, ProductImage.sort_order)
            .where(ProductImage.product_id.in_(product_ids))
            .order_by(ProductImage.sort_order)
        )).all()
    )
    out: dict[uuid.UUID, str] = {}
    for pid, url, _so in rows:
        out.setdefault(pid, url)
    return out


# --------------------------------------------------------------------- detail
def _variant_out(v: ProductVariant, sold: dict[uuid.UUID, int]) -> AdminVariantOut:
    return AdminVariantOut(
        id=v.id,
        name=v.name,
        sku=v.sku,
        price=int(v.price),
        compare_at_price=_int_or_none(v.compare_at_price),
        stock=v.stock,
        weight_grams=v.weight_grams,
        attributes=v.attributes or {},
        is_active=v.is_active,
        sold_units=sold.get(v.id, 0),
    )


def _int_or_none(v: Any) -> int | None:
    return int(v) if v is not None else None


async def get_product(db: AsyncSession, product_id: uuid.UUID) -> AdminProductDetail:
    product = (
        await db.scalars(
            select(Product)
            .options(selectinload(Product.variants), selectinload(Product.images))
            .where(Product.id == product_id)
        )
    ).first()
    if product is None:
        raise NotFoundError()

    variant_ids = [v.id for v in product.variants]
    sold: dict[uuid.UUID, int] = {}
    if variant_ids:
        units = (
            (await db.execute(
                select(OrderItem.product_variant_id, func.sum(OrderItem.quantity))
                .where(OrderItem.product_variant_id.in_(variant_ids))
                .group_by(OrderItem.product_variant_id)
            )).all()
        )
        sold = {vid: int(n or 0) for vid, n in units}

    active_variants = [v for v in product.variants if v.is_active]
    return AdminProductDetail(
        id=product.id,
        name=product.name,
        slug=product.slug,
        category_id=product.category_id,
        is_active=product.is_active,
        deleted_at=product.deleted_at,
        description=product.description,
        updated_at=product.updated_at,
        created_at=product.created_at,
        min_price=min((v.price for v in active_variants), default=0),
        total_stock=sum(v.stock for v in active_variants),
        variant_count=len(product.variants),
        image_url=product.images[0].url if product.images else None,
        variants=[_variant_out(v, sold) for v in product.variants],
        images=[
            AdminImageOut(id=i.id, url=i.url, alt_text=i.alt_text, sort_order=i.sort_order)
            for i in sorted(product.images, key=lambda x: x.sort_order)
        ],
    )


# --------------------------------------------------------------------- create
async def create_product(db: AsyncSession, body: ProductCreateIn) -> AdminProductDetail:
    if not await db.scalar(select(Category.id).where(Category.id == body.category_id)):
        raise ValidationAppError(
            "VALIDATION", "Unknown category", details={"category_id": str(body.category_id)}
        )

    product = Product(
        name=body.name,
        slug=await unique_slug(db, Product, body.name, max_length=200),
        description=body.description,
        category_id=body.category_id,
        is_active=body.is_active,
    )
    db.add(product)
    await db.flush()

    for i, img in enumerate(body.images):
        db.add(ProductImage(product_id=product.id, url=img.url, alt_text=img.alt_text, sort_order=i))
    for spec in body.variants:
        if spec.sku:
            sku = spec.sku.upper()
            taken = await db.scalar(select(ProductVariant.id).where(ProductVariant.sku == sku))
            if taken:
                raise ConflictError("SKU_TAKEN", f"SKU '{sku}' already exists")
        else:
            sku = await _unique_sku(db, product.name)
        db.add(ProductVariant(
            product_id=product.id,
            name=spec.name,
            sku=sku,
            price=spec.price,
            compare_at_price=spec.compare_at_price,
            stock=spec.stock,
            weight_grams=spec.weight_grams,
            attributes=spec.attributes,
        ))
    await db.flush()
    return await get_product(db, product.id)


async def update_product(
    db: AsyncSession, product_id: uuid.UUID, body: ProductUpdateIn
) -> AdminProductDetail:
    product = (
        await db.scalars(select(Product).where(Product.id == product_id))
    ).first()
    if product is None:
        raise NotFoundError()
    patch = body.model_dump(exclude_unset=True)
    if "category_id" in patch and not await db.scalar(
        select(Category.id).where(Category.id == patch["category_id"])
    ):
        raise ValidationAppError("VALIDATION", "Unknown category")
    for field, value in patch.items():
        setattr(product, field, value)
    await db.flush()
    return await get_product(db, product.id)


async def soft_delete_product(db: AsyncSession, product_id: uuid.UUID) -> None:
    product = await db.scalar(select(Product).where(Product.id == product_id))
    if product is None:
        raise NotFoundError()
    product.deleted_at = _now()
    product.is_active = False
    await db.execute(
        update(ProductVariant)
        .where(ProductVariant.product_id == product_id)
        .values(is_active=False)
    )
    await db.flush()


# -------------------------------------------------------------------- variants
async def add_variant(
    db: AsyncSession, product_id: uuid.UUID, body: VariantCreateIn
) -> AdminProductDetail:
    product = await db.scalar(select(Product).where(Product.id == product_id))
    if product is None:
        raise NotFoundError()
    if body.sku:
        sku = body.sku.upper()
        taken = await db.scalar(select(ProductVariant.id).where(ProductVariant.sku == sku))
        if taken:
            raise ConflictError("SKU_TAKEN", f"SKU '{sku}' already exists")
    else:
        sku = await _unique_sku(db, product.name)
    db.add(ProductVariant(
        product_id=product_id,
        name=body.name,
        sku=sku,
        price=body.price,
        compare_at_price=body.compare_at_price,
        stock=body.stock,
        weight_grams=body.weight_grams,
        attributes=body.attributes,
    ))
    await db.flush()
    return await get_product(db, product_id)


async def _variant_of(db: AsyncSession, variant_id: uuid.UUID) -> ProductVariant:
    variant = await db.scalar(select(ProductVariant).where(ProductVariant.id == variant_id))
    if variant is None:
        raise NotFoundError()
    return variant


async def update_variant(
    db: AsyncSession, variant_id: uuid.UUID, body: VariantUpdateIn
) -> AdminProductDetail:
    variant = await _variant_of(db, variant_id)
    patch = body.model_dump(exclude_unset=True)
    if patch.get("sku") and patch["sku"] != variant.sku:
        new_sku = patch["sku"].upper()
        taken = await db.scalar(select(ProductVariant.id).where(ProductVariant.sku == new_sku))
        if taken:
            raise ConflictError("SKU_TAKEN", f"SKU '{new_sku}' already exists")
        patch["sku"] = new_sku
    if patch.get("compare_at_price") is not None:
        price = patch.get("price", variant.price)
        if patch["compare_at_price"] < price:
            raise ValidationAppError("VALIDATION", "compare_at_price must be >= price")
    for field, value in patch.items():
        setattr(variant, field, value)
    await db.flush()
    return await get_product(db, variant.product_id)


async def delete_variant(db: AsyncSession, variant_id: uuid.UUID) -> None:
    """Hard delete allowed only when the variant has never been sold."""
    variant = await _variant_of(db, variant_id)
    sold = await db.scalar(
        select(func.count()).select_from(OrderItem).where(OrderItem.product_variant_id == variant_id)
    )
    if int(sold or 0) > 0:
        raise ConflictError(
            "VARIANT_SOLD", "This variant has been sold — deactivate it instead of deleting"
        )
    # cart lines referencing the variant die with it (FK is RESTRICT)
    await db.execute(delete(CartItem).where(CartItem.product_variant_id == variant_id))
    await db.execute(delete(ProductVariant).where(ProductVariant.id == variant_id))
    await db.flush()


# ---------------------------------------------------------------------- images
async def replace_images(
    db: AsyncSession, product_id: uuid.UUID, body: list[ImageSpecIn]
) -> AdminProductDetail:
    """Full reorder: replaces the product's gallery (spec: attach + sort in one call)."""
    if not await db.scalar(select(Product.id).where(Product.id == product_id)):
        raise NotFoundError()
    await db.execute(delete(ProductImage).where(ProductImage.product_id == product_id))
    for i, img in enumerate(body):
        db.add(ProductImage(product_id=product_id, url=img.url, alt_text=img.alt_text, sort_order=i))
    await db.flush()
    return await get_product(db, product_id)


# ------------------------------------------------------------------ categories
async def list_categories(db: AsyncSession) -> list[AdminCategoryOut]:
    rows = (
        (await db.execute(
            select(Category, func.count(Product.id))
            .outerjoin(Product, Product.category_id == Category.id)
            .group_by(Category.id)
            .order_by(Category.sort_order, Category.name)
        )).all()
    )
    return [category_out(c, int(n or 0)) for c, n in rows]


def category_out(c: Category, count: int) -> AdminCategoryOut:
    return AdminCategoryOut(
        id=c.id, name=c.name, slug=c.slug, parent_id=c.parent_id,
        image_url=c.image_url, is_active=c.is_active, sort_order=c.sort_order,
        product_count=count,
    )


async def create_category(db: AsyncSession, body: CategoryCreateIn) -> AdminCategoryOut:
    if body.parent_id is not None and not await db.scalar(
        select(Category.id).where(Category.id == body.parent_id)
    ):
        raise ValidationAppError("VALIDATION", "Unknown parent category")
    c = Category(
        name=body.name,
        slug=await unique_slug(db, Category, body.name, max_length=160),
        parent_id=body.parent_id,
        image_url=body.image_url,
        sort_order=body.sort_order,
    )
    db.add(c)
    await db.flush()
    return await get_category(db, c.id)


async def get_category(db: AsyncSession, category_id: uuid.UUID) -> AdminCategoryOut:
    c = await db.scalar(select(Category).where(Category.id == category_id))
    if c is None:
        raise NotFoundError()
    count = int(
        await db.scalar(
            select(func.count()).select_from(Product).where(Product.category_id == category_id)
        )
        or 0
    )
    return category_out(c, count)


async def update_category(
    db: AsyncSession, category_id: uuid.UUID, body: CategoryUpdateIn
) -> AdminCategoryOut:
    c = await db.scalar(select(Category).where(Category.id == category_id))
    if c is None:
        raise NotFoundError()
    patch = body.model_dump(exclude_unset=True)
    if patch.get("parent_id") is not None:
        if patch["parent_id"] == category_id:
            raise ValidationAppError("VALIDATION", "A category cannot be its own parent")
        if not await db.scalar(select(Category.id).where(Category.id == patch["parent_id"])):
            raise ValidationAppError("VALIDATION", "Unknown parent category")
    for field, value in patch.items():
        setattr(c, field, value)
    await db.flush()
    return await get_category(db, category_id)


async def delete_category(db: AsyncSession, category_id: uuid.UUID) -> None:
    if not await db.scalar(select(Category.id).where(Category.id == category_id)):
        raise NotFoundError()
    products = int(
        await db.scalar(
            select(func.count()).select_from(Product).where(Product.category_id == category_id)
        )
        or 0
    )
    children = int(
        await db.scalar(select(func.count()).select_from(Category).where(Category.parent_id == category_id))
        or 0
    )
    if products or children:
        raise ConflictError(
            "CATEGORY_IN_USE",
            f"Category has {products} product(s) and {children} subcategory(ies) — deactivate instead",
        )
    await db.execute(delete(Category).where(Category.id == category_id))
    await db.flush()
