"""Account-scoped reads (docs/04 §7): my reviews."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.core.deps import UserDep
from app.core.pagination import Page, PageRequest
from app.db.session import get_db
from app.models import Product, Review
from app.routers import API_PREFIX
from app.schemas.catalog_schemas import MyReviewOut

router = APIRouter(prefix=f"{API_PREFIX}/users", tags=["users"])


@router.get("/reviews", response_model=Page[MyReviewOut])
async def my_reviews(
    user: UserDep,
    db=Depends(get_db),
    page: int = 1,
    page_size: int = 20,
) -> Page[MyReviewOut]:
    """The signed-in user's reviews, newest first, with product info."""
    base = (
        select(Review, Product.id, Product.slug, Product.name)
        .join(Product, Product.id == Review.product_id)
        .where(Review.user_id == user.id)
    )
    total = await db.scalar(
        select(func.count())
        .select_from(Review)
        .where(Review.user_id == user.id)
    )
    rows = (
        await db.execute(
            base.order_by(Review.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [
        MyReviewOut(
            id=review.id,
            rating=review.rating,
            title=review.title,
            body=review.body,
            is_verified_purchase=review.is_verified_purchase,
            created_at=review.created_at,
            product_id=product_id,
            product_slug=slug,
            product_name=name,
        )
        for review, product_id, slug, name in rows
    ]
    return Page.build(
        items=items, total=int(total or 0), req=PageRequest(page=page, page_size=page_size)
    )
