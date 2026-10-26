"""Cart business logic (docs/04 §5): guest + user carts, merge, caps."""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select

from app.core.exceptions import NotFoundError, ValidationAppError
from app.models import Cart, CartItem, Product, ProductImage, ProductVariant
from app.schemas.cart_schemas import CartItemOut, CartOut, CartTotalsOut


def new_guest_token() -> str:
    return uuid.uuid4().hex


async def get_cart(db, *, user_id: uuid.UUID | None, guest_token: str | None) -> Cart | None:
    if user_id is not None:
        return await db.scalar(select(Cart).where(Cart.user_id == user_id))
    if guest_token:
        return await db.scalar(select(Cart).where(Cart.guest_token == guest_token))
    return None


async def get_or_create_cart(
    db, *, user_id: uuid.UUID | None, guest_token: str | None
) -> Cart:
    cart = await get_cart(db, user_id=user_id, guest_token=guest_token)
    if cart is None:
        if user_id is not None:
            cart = Cart(user_id=user_id)
        elif guest_token:
            cart = Cart(guest_token=guest_token)
        else:  # pragma: no cover - callers guarantee one of the two
            raise ValidationAppError("VALIDATION", "Missing cart identity")
        db.add(cart)
        await db.flush()
    return cart


async def read_cart(db, cart: Cart) -> CartOut:
    rows = (
        (
            await db.execute(
                select(CartItem, ProductVariant, Product.name.label("product_name"), Product.slug)
                .join(ProductVariant, ProductVariant.id == CartItem.product_variant_id)
                .join(Product, Product.id == ProductVariant.product_id)
                .where(CartItem.cart_id == cart.id)
                .order_by(CartItem.created_at)
            )
        )
        .all()
    )
    product_ids = [r[1].product_id for r in rows]
    images = await _first_images(db, list(set(product_ids)))

    items: list[CartItemOut] = []
    subtotal = 0
    total_count = 0
    for item, variant, product_name, product_slug in rows:
        line_total = int(variant.price) * item.quantity
        subtotal += line_total
        total_count += item.quantity
        items.append(
            CartItemOut(
                product_variant_id=variant.id,
                product_id=variant.product_id,
                product_name=product_name,
                product_slug=product_slug,
                variant_name=variant.name,
                sku=variant.sku,
                unit_price=int(variant.price),
                quantity=item.quantity,
                line_total=line_total,
                image_url=images.get(variant.product_id),
                in_stock=variant.stock >= item.quantity,
                stock=variant.stock,
            )
        )
    return CartOut(items=items, totals=CartTotalsOut(subtotal=subtotal, total_items=total_count))


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


async def add_item(
    db, *, cart: Cart, variant_id: uuid.UUID, quantity: int
) -> CartItem | None:
    variant = await db.get(ProductVariant, variant_id)
    if variant is None or (not variant.is_active):
        raise NotFoundError("NOT_FOUND", "Product variant not available")

    if variant.stock <= 0:
        raise ValidationAppError("OUT_OF_STOCK", "This item is out of stock")

    existing = await db.scalar(
        select(CartItem).where(
            CartItem.cart_id == cart.id, CartItem.product_variant_id == variant_id
        )
    )
    current = existing.quantity if existing else 0
    capped = min(99, variant.stock, current + quantity)
    if capped <= 0:  # pragma: no cover - guarded by stock check above
        raise ValidationAppError("OUT_OF_STOCK", "Cannot add this quantity")
    if existing:
        existing.quantity = capped
        existing.updated_at = datetime.now(timezone.utc)
    else:
        existing = CartItem(cart_id=cart.id, product_variant_id=variant_id, quantity=capped)
        db.add(existing)
    await db.flush()
    return existing


async def update_item(
    db, *, cart: Cart, variant_id: uuid.UUID, quantity: int
) -> CartItem | None:
    item = await db.scalar(
        select(CartItem).where(
            CartItem.cart_id == cart.id, CartItem.product_variant_id == variant_id
        )
    )
    if item is None:
        raise NotFoundError("NOT_FOUND", "Item not in cart")
    if quantity == 0:
        await db.delete(item)
        await db.flush()
        return None
    variant = await db.get(ProductVariant, variant_id)
    if variant is None or not variant.is_active:
        raise ValidationAppError("OUT_OF_STOCK", "This item is no longer available")
    capped = min(99, variant.stock, quantity)
    item.quantity = capped
    item.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return item


async def remove_item(db, *, cart: Cart, variant_id: uuid.UUID) -> None:
    result = await db.execute(
        delete(CartItem).where(
            CartItem.cart_id == cart.id, CartItem.product_variant_id == variant_id
        )
    )
    if result.rowcount == 0:
        raise NotFoundError("NOT_FOUND", "Item not in cart")


async def clear_cart(db, *, cart: Cart) -> None:
    await db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))


async def merge_carts(
    db, *, user_cart: Cart, guest_cart_id: uuid.UUID
) -> tuple[Cart, list[dict[str, Any]]]:
    """Merge a guest cart into the (existing or new) user cart.

    Skipped lines (unavailable variants) are reported for the caller/log.
    """
    skipped: list[dict[str, Any]] = []
    guest_items = (
        (
            await db.execute(
                select(CartItem).where(CartItem.cart_id == guest_cart_id)
            )
        )
        .scalars()
        .all()
    )

    for g in guest_items:
        variant = await db.get(ProductVariant, g.product_variant_id)
        if variant is None or not variant.is_active or variant.stock <= 0:
            skipped.append({"variant_id": str(g.product_variant_id), "reason": "unavailable"})
            continue
        existing = await db.scalar(
            select(CartItem).where(
                CartItem.cart_id == user_cart.id,
                CartItem.product_variant_id == g.product_variant_id,
            )
        )
        capped = min(99, variant.stock, (existing.quantity if existing else 0) + g.quantity)
        if existing:
            existing.quantity = capped
        elif capped > 0:
            db.add(
                CartItem(
                    cart_id=user_cart.id,
                    product_variant_id=g.product_variant_id,
                    quantity=capped,
                )
            )
        await db.flush()

    # remove guest cart entirely
    await db.execute(delete(CartItem).where(CartItem.cart_id == guest_cart_id))
    await db.execute(delete(Cart).where(Cart.id == guest_cart_id))
    await db.flush()
    return user_cart, skipped
