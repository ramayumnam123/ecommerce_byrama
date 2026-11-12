"""Customer order routes (docs/04 §7): my orders, detail, cancel."""

import uuid

from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.core.pagination import Page
from app.db.session import get_db
from app.models import User
from app.routers import API_PREFIX
from app.schemas.checkout_schemas import OrderOut
from app.services import order_service

router = APIRouter(prefix=f"{API_PREFIX}/orders", tags=["orders"])


@router.get("", response_model=Page[OrderOut])
async def my_orders(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
    page: int = 1,
    page_size: int = 20,
) -> Page[OrderOut]:
    return await order_service.list_my_orders(
        db, user, page=page, page_size=page_size
    )


@router.get("/{order_id}", response_model=OrderOut)
async def order_detail(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> OrderOut:
    return await order_service.get_order(db, user, order_id)


@router.post("/{order_id}/cancel", response_model=OrderOut)
async def cancel_order(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> OrderOut:
    return await order_service.cancel(db, user, order_id)
