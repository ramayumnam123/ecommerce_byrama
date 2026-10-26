from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthError, NotFoundError, ValidationAppError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User
from app.routers import API_PREFIX
from app.schemas.cart_schemas import (
    AddCartItemIn,
    CartOut,
    CartTotalsOut,
    MergeCartIn,
    UpdateCartItemIn,
)
from app.services import cart_service

router = APIRouter(prefix=f"{API_PREFIX}/cart", tags=["cart"])

GUEST_HEADER = "x-guest-token"

EmptyCart = CartOut(items=[], totals=CartTotalsOut(subtotal=0, total_items=0))


async def optional_user(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
) -> User | None:
    """Anonymous-friendly current user: None without a token; 401 on bad token."""
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    payload = decode_access_token(header[7:].strip())
    user = await db.scalar(select(User).where(User.id == payload.sub))
    if user is None or not user.is_active:
        raise AuthError("AUTH_REQUIRED", "Account not found or disabled", 401)
    return user



@router.get("", response_model=CartOut)
async def get_cart(
    request: Request,
    guest_token: Annotated[str | None, Header(alias=GUEST_HEADER)] = None,
    db=Depends(get_db),
    user: User | None = Depends(optional_user),
) -> CartOut:
    cart = await cart_service.get_cart(
        db, user_id=user.id if user else None, guest_token=guest_token
    )
    if cart is None:
        return EmptyCart
    return await cart_service.read_cart(db, cart)


@router.post("/items", response_model=CartOut, status_code=200)
async def add_item(
    body: AddCartItemIn,
    response: Response,
    request: Request,
    guest_token: Annotated[str | None, Header(alias=GUEST_HEADER)] = None,
    db=Depends(get_db),
    user: User | None = Depends(optional_user),
) -> CartOut:
    if user is not None:
        cart = await cart_service.get_or_create_cart(db, user_id=user.id, guest_token=None)
        await cart_service.add_item(
            db, cart=cart, variant_id=body.product_variant_id, quantity=body.quantity
        )
        out_cart = cart
    else:
        token = guest_token
        if not token:
            token = cart_service.new_guest_token()
            response.headers[GUEST_HEADER] = token
        cart = await cart_service.get_or_create_cart(
            db, user_id=None, guest_token=token
        )
        await cart_service.add_item(
            db, cart=cart, variant_id=body.product_variant_id, quantity=body.quantity
        )
        out_cart = cart
    return await cart_service.read_cart(db, out_cart)


@router.patch("/items/{variant_id}", response_model=CartOut)
async def update_item(
    variant_id: str,
    body: UpdateCartItemIn,
    request: Request,
    guest_token: Annotated[str | None, Header(alias=GUEST_HEADER)] = None,
    db=Depends(get_db),
    user: User | None = Depends(optional_user),
) -> CartOut:
    cart = await _require_cart(db, request, user, guest_token)
    await cart_service.update_item(db, cart=cart, variant_id=variant_id_to_uuid(variant_id), quantity=body.quantity)
    return await cart_service.read_cart(db, cart)


@router.delete("/items/{variant_id}", response_model=CartOut)
async def remove_item(
    variant_id: str,
    request: Request,
    guest_token: Annotated[str | None, Header(alias=GUEST_HEADER)] = None,
    db=Depends(get_db),
    user: User | None = Depends(optional_user),
) -> CartOut:
    cart = await _require_cart(db, request, user, guest_token)
    await cart_service.remove_item(db, cart=cart, variant_id=variant_id_to_uuid(variant_id))
    return await cart_service.read_cart(db, cart)


@router.delete("", response_model=CartOut)
async def clear_cart(
    request: Request,
    guest_token: Annotated[str | None, Header(alias=GUEST_HEADER)] = None,
    db=Depends(get_db),
    user: User | None = Depends(optional_user),
) -> CartOut:
    cart = await _require_cart(db, request, user, guest_token)
    await cart_service.clear_cart(db, cart=cart)
    return await cart_service.read_cart(db, cart)


@router.post("/merge", response_model=CartOut)
async def merge_carts(
    body: MergeCartIn,
    request: Request,
    db=Depends(get_db),
    user: User | None = Depends(optional_user),
) -> CartOut:
    if user is None:
        raise AuthError("AUTH_REQUIRED", "Sign in before merging carts", 401)

    guest_cart = await cart_service.get_cart(db, user_id=None, guest_token=body.guest_token)
    if guest_cart is None:
        # nothing to merge — ensure a user cart exists and return it
        cart = await cart_service.get_or_create_cart(db, user_id=user.id, guest_token=None)
        return await cart_service.read_cart(db, cart)

    user_cart = await cart_service.get_or_create_cart(db, user_id=user.id, guest_token=None)
    _, skipped = await cart_service.merge_carts(db, user_cart=user_cart, guest_cart_id=guest_cart.id)
    if skipped:
        from app.core.logging import get_logger

        get_logger().bind(skipped=skipped).info("cart_merge_skipped")
    return await cart_service.read_cart(db, user_cart)


def variant_id_to_uuid(v: str):
    import uuid as uuid_mod

    try:
        return uuid_mod.UUID(v)
    except ValueError:
        raise ValidationAppError("VALIDATION", "Invalid variant id", 400)


async def _require_cart(db, request: Request, user: User | None, guest_token: str | None):
    cart = await cart_service.get_cart(
        db, user_id=user.id if user else None, guest_token=guest_token
    )
    if cart is None:
        raise NotFoundError("NOT_FOUND", "Cart not found")
    return cart
