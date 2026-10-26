"""Catalog reads: category tree, product list/detail, reviews (docs/04 §4)."""

import uuid
from typing import Any

from sqlalchemy import Row, func, select
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.core.pagination import Page, PageRequest
from app.models import Category, Product, ProductImage, ProductVariant, Review
from app.schemas.catalog_schemas import (
    CategoryOut,
    ProductDetail,
    ProductImageOut,
    ProductListItem,
    ProductVariantOut,
    RatingOut,
)
from app.utils.slugify import slugify

MAX_PAGE_SIZE = 100


# ------------------------------------------------------------------ categories
async def get_category_tree(db) -> list[CategoryOut]:
    rows: list[Category] = (
        await db.scalars(select(Category).where(Category.is_active))
    ).all()
    return build_category_tree(rows)


def build_category_tree(rows: list[Category]) -> list[CategoryOut]:
    by_parent: dict[uuid.UUID | None, list[Category]] = {}
    for c in rows:
        by_parent.setdefault(c.parent_id, []).append(c)

    def to_out(c: Category) -> CategoryOut:
        children = sorted(by_parent.get(c.id, []), key=lambda x: (x.sort_order, x.name))
        return CategoryOut(
            id=c.id,
            name=c.name,
            slug=c.slug,
            image_url=c.image_url,
            children=[to_out(ch) for ch in children],
        )

    return [
        to_out(c)
        for c in sorted(by_parent.get(None, []), key=lambda x: (x.sort_order, x.name))
    ]


async def get_category_by_slug(db, slug: str) -> CategoryOut | None:
    c = await db.scalar(
        select(Category).where(Category.slug == slugify(slug), Category.is_active)
    )
    if not c:
        return None
    children = await db.scalars(
        select(Category)
        .where(Category.parent_id == c.id, Category.is_active)
        .order_by(Category.sort_order, Category.name)
    )
    return CategoryOut(
        id=c.id,
        name=c.name,
        slug=c.slug,
        image_url=c.image_url,
        children=[
            CategoryOut(id=ch.id, name=ch.name, slug=ch.slug, image_url=ch.image_url)
            for ch in children
        ],
    )


# ------------------------------------------------------------------ products
def _variant_agg_subquery():
    return (
        select(
            ProductVariant.product_id.label("product_id"),
            func.min(ProductVariant.price).label("min_price"),
            func.min(ProductVariant.compare_at_price).label("compare_at_price"),
            func.sum(ProductVariant.stock).label("total_stock"),
        )
        .where(ProductVariant.is_active)
        .group_by(ProductVariant.product_id)
        .subquery()
    )


def _variant_exists(cond):
    return (
        select(ProductVariant.id)
        .where(ProductVariant.product_id == Product.id, ProductVariant.is_active, cond)
        .exists()
    )


async def list_products(
    db,
    *,
    q: str | None = None,
    category: str | None = None,
    min_price: int | None = None,  # paise
    max_price: int | None = None,
    color: str | None = None,
    size: str | None = None,
    in_stock: bool = False,
    sort: str = "newest",
    page: int = 1,
    page_size: int = 20,
) -> Page[ProductListItem]:
    page_size = min(page_size, MAX_PAGE_SIZE)
    v_agg = _variant_agg_subquery()

    stmt = (
        select(Product, v_agg.c.min_price, v_agg.c.compare_at_price, v_agg.c.total_stock)
        .join(v_agg, v_agg.c.product_id == Product.id)
        .join(Category, Category.id == Product.category_id)
        .where(Product.is_active, Product.deleted_at.is_(None), Category.is_active)
    )

    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            Product.name.ilike(like) | Product.description.ilike(like) | Product.slug.ilike(like)
        )
    if category:
        cat_ids = await _category_and_descendants_ids(db, category)
        stmt = stmt.where(Product.category_id.in_(cat_ids))
    if min_price is not None:
        stmt = stmt.where(v_agg.c.min_price >= min_price)
    if max_price is not None:
        stmt = stmt.where(v_agg.c.min_price <= max_price)
    if color:
        stmt = stmt.where(
            _variant_exists(ProductVariant.attributes.op("->>")("color") == color.lower())
        )
    if size:
        stmt = stmt.where(
            _variant_exists(ProductVariant.attributes.op("->>")("size") == size.lower())
        )
    if in_stock:
        stmt = stmt.where(v_agg.c.total_stock > 0)

    order_by = {
        "price_asc": [func.coalesce(v_agg.c.min_price, 10**13).asc()],
        "price_desc": [func.coalesce(v_agg.c.min_price, -1).desc()],
    }.get(sort)
    if order_by is None:
        if sort == "rating":
            r_agg = (
                select(Review.product_id.label("product_id"), func.avg(Review.rating).label("rate"))
                .where(Review.is_published)
                .group_by(Review.product_id)
                .subquery()
            )
            stmt = stmt.outerjoin(r_agg, r_agg.c.product_id == Product.id)
            order_by = [func.coalesce(r_agg.c.rate, 0).desc()]
        else:
            order_by = [Product.created_at.desc()]
    stmt = stmt.order_by(*order_by)

    stmt = stmt.add_columns(func.count().over().label("total"))
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows: list[Row[Any]] = (await db.execute(stmt)).all()
    total = int(rows[0].total) if rows else 0

    items = await _hydrate_list_items(db, rows)
    return Page.build(items=items, total=total, req=PageRequest(page=page, page_size=page_size))


def _variant_exists(cond):
    return (
        select(ProductVariant.id)
        .where(ProductVariant.product_id == Product.id, ProductVariant.is_active, cond)
        .exists()
    )


async def _category_and_descendants_ids(db, slug: str) -> list[uuid.UUID]:
    base = await db.scalar(select(Category.id).where(Category.slug == slugify(slug)))
    if base is None:
        raise NotFoundError("NOT_FOUND", "Unknown category")
    children = (await db.scalars(select(Category.id).where(Category.parent_id == base))).all()
    return list({base, *children})


async def _ratings_map(db, product_ids: list[uuid.UUID]) -> dict[uuid.UUID, RatingOut]:
    if not product_ids:
        return {}
    rows = (
        (await db.execute(
            select(
                Review.product_id,
                func.avg(Review.rating).label("avg"),
                func.count().label("cnt"),
            )
            .where(Review.product_id.in_(product_ids), Review.is_published)
            .group_by(Review.product_id)
        ))
        .all()
    )
    return {p: RatingOut(average=round(float(a), 2), count=c) for p, a, c in rows}


async def _first_images(db, product_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not product_ids:
        return {}
    rows = (
        (await db.execute(
            select(ProductImage.product_id, ProductImage.url, ProductImage.sort_order)
            .where(ProductImage.product_id.in_(product_ids))
            .order_by(ProductImage.sort_order)
        ))
        .all()
    )
    out: dict[uuid.UUID, str] = {}
    for pid, url, _so in rows:
        out.setdefault(pid, url)
    return out


async def _category_slug_map(db) -> dict[uuid.UUID, str]:
    rows = (await db.execute(select(Category.id, Category.slug))).all()
    return {pid: slug for pid, slug in rows}


async def _hydrate_list_items(
    db, rows: list[Row[Any]], category_slugs: dict[uuid.UUID, str] | None = None
) -> list[ProductListItem]:
    product_ids = [r[0].id for r in rows]
    images = await _first_images(db, product_ids)
    ratings = await _ratings_map(db, product_ids)
    if category_slugs is None:
        category_slugs = await _category_slug_map(db)

    items: list[ProductListItem] = []
    for product, min_price, compare_at, total_stock, *_ in rows:
        items.append(
            ProductListItem(
                id=product.id,
                name=product.name,
                slug=product.slug,
                category_slug=category_slugs.get(product.category_id),
                min_price=int(min_price or 0),
                compare_at_price=int(compare_at) if compare_at else None,
                image_url=images.get(product.id),
                total_stock=int(total_stock or 0),
                in_stock=bool((total_stock or 0) > 0),
                rating=ratings.get(product.id, RatingOut()),
            )
        )
    return items


async def get_product_detail(db, slug: str) -> ProductDetail | None:
    product = await db.scalar(
        select(Product)
        .options(selectinload(Product.images), selectinload(Product.variants))
        .where(
            Product.slug == slug,
            Product.is_active,
            Product.deleted_at.is_(None),
        )
    )
    if not product:
        return None

    category_slug = await db.scalar(select(Category.slug).where(Category.id == product.category_id))
    min_price = min(v.price for v in product.variants if v.is_active) if product.variants else 0
    compare = min(
        (v.compare_at_price for v in product.variants if v.is_active and v.compare_at_price),
        default=None,
    )
    total_stock = sum(v.stock for v in product.variants if v.is_active)
    rating = (await _ratings_map(db, [product.id])).get(product.id, RatingOut())
    images = sorted(product.images, key=lambda i: i.sort_order)

    return ProductDetail(
        id=product.id,
        name=product.name,
        slug=product.slug,
        category_slug=category_slug,
        description=product.description,
        created_at=product.created_at,
        min_price=int(min_price),
        compare_at_price=int(compare) if compare else None,
        image_url=images[0].url if images else None,
        total_stock=int(total_stock),
        in_stock=total_stock > 0,
        rating=rating,
        variants=[
            ProductVariantOut(
                id=v.id,
                name=v.name,
                sku=v.sku,
                price=int(v.price),
                compare_at_price=int(v.compare_at_price) if v.compare_at_price else None,
                stock=v.stock,
                attributes=v.attributes or {},
            )
            for v in product.variants
            if v.is_active
        ],
        images=[
            ProductImageOut(url=i.url, alt_text=i.alt_text, sort_order=i.sort_order)
            for i in images
        ],
    )


# ------------------------------------------------------------------ reviews
async def list_product_reviews(
    db, *, product_id: uuid.UUID, page: int = 1, page_size: int = 20
) -> tuple[list, int]:
    """Returns (rows_of_review dicts, total)."""
    from sqlalchemy.orm import aliased
    from app.models import User

    base = (
        select(Review, User.full_name)
        .join(User, User.id == Review.user_id)
        .where(Review.product_id == product_id, Review.is_published)
    )
    total = await db.scalar(
        select(func.count())
        .select_from(Review)
        .where(Review.product_id == product_id, Review.is_published)
    )
    rows = (
        (
            await db.execute(
                base.add_columns(User.full_name)
                .order_by(Review.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        .all()
    )
    return rows, int(total or 0)
