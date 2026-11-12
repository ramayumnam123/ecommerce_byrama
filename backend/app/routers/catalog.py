"""Public catalog routes (docs/04 §4)."""

from fastapi import APIRouter, Depends, Query, Response

from app.core.deps import UserDep
from app.core.pagination import Page, pagination
from app.db.session import get_db
from app.routers import API_PREFIX
from app.schemas.catalog_schemas import (
    CategoryOut,
    ProductDetail,
    ProductListItem,
    ReviewIn,
    ReviewOut,
)
from app.services import catalog_service

router = APIRouter(prefix=f"{API_PREFIX}", tags=["catalog"])


@router.get("/categories", response_model=list[CategoryOut])
async def get_categories(db=Depends(get_db)) -> list[CategoryOut]:
    return await catalog_service.get_category_tree(db)


@router.get("/categories/{slug}", response_model=CategoryOut)
async def get_category(slug: str, db=Depends(get_db)) -> CategoryOut:
    out = await catalog_service.get_category_by_slug(db, slug)
    if not out:
        from app.core.exceptions import NotFoundError

        raise NotFoundError()
    return out


@router.get("/products", response_model=Page[ProductListItem])
async def list_products(
    q: str | None = Query(None, max_length=100),
    category: str | None = None,
    min_price: int | None = Query(None, ge=0),
    max_price: int | None = Query(None, ge=0),
    color: str | None = None,
    size: str | None = None,
    in_stock: bool = False,
    sort: str = Query("newest", pattern="^(newest|price_asc|price_desc|rating)$"),
    page: int = 1,
    page_size: int = 20,
    db=Depends(get_db),
) -> Page[ProductListItem]:
    return await catalog_service.list_products(
        db,
        q=q,
        category=category,
        min_price=min_price,
        max_price=max_price,
        color=color,
        size=size,
        in_stock=in_stock,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@router.get("/products/{slug}", response_model=ProductDetail)
async def get_product(slug: str, db=Depends(get_db)) -> ProductDetail:
    detail = await catalog_service.get_product_detail(db, slug)
    if not detail:
        from app.core.exceptions import NotFoundError

        raise NotFoundError()
    return detail


@router.post("/products/{slug}/reviews", response_model=ReviewOut)
async def create_product_review(
    slug: str,
    payload: ReviewIn,
    user: UserDep,
    response: Response,
    db=Depends(get_db),
) -> ReviewOut:
    """Create (201) or update (200) the signed-in user's review for a product."""
    from sqlalchemy import select

    from app.core.exceptions import NotFoundError
    from app.models import Product

    product_id = await db.scalar(select(Product.id).where(Product.slug == slug))
    if not product_id:
        raise NotFoundError()
    review, created = await catalog_service.upsert_review(
        db,
        user=user,
        product_id=product_id,
        rating=payload.rating,
        title=payload.title,
        body=payload.body,
    )
    response.status_code = 201 if created else 200
    return ReviewOut(
        id=review.id,
        rating=review.rating,
        title=review.title,
        body=review.body,
        user_name=user.full_name,
        is_verified_purchase=review.is_verified_purchase,
        created_at=review.created_at,
    )


@router.get("/products/{slug}/reviews", response_model=Page[ReviewOut])
async def list_product_reviews(
    slug: str,
    page: int = 1,
    page_size: int = 20,
    db=Depends(get_db),
) -> Page[ReviewOut]:
    from sqlalchemy import select

    from app.core.exceptions import NotFoundError
    from app.models import Product

    product_id = await db.scalar(select(Product.id).where(Product.slug == slug))
    if not product_id:
        raise NotFoundError()
    rows, total = await catalog_service.list_product_reviews(
        db, product_id=product_id, page=page, page_size=page_size
    )
    from app.core.pagination import PageRequest
    from app.schemas.catalog_schemas import ReviewOut as R

    items = [
        R(
            id=review.id,
            rating=review.rating,
            title=review.title,
            body=review.body,
            user_name=name,
            is_verified_purchase=review.is_verified_purchase,
            created_at=review.created_at,
        )
        for review, name in rows
    ]
    return Page.build(items=items, total=total, req=PageRequest(page=page, page_size=page_size))
