"""Seed data (docs/03 §6): admin user, categories, 20 products × variants (2026
realistic INR prices), WELCOME10 coupon, and optional 60 days of demo orders
so the analytics dashboard shows charts immediately.

Run from backend/:
    .\\.venv\\Scripts\\python -m scripts.seed
    .\\.venv\\Scripts\\python -m scripts.seed --with-demo-orders

Idempotent: existing slugs/emails/skus are skipped — safe to re-run.
Images are external picsum.photos placeholders (no storage needed locally).
"""

import argparse
import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import (
    Category,
    Coupon,
    DiscountType,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentKind,
    PaymentStatus,
    Product,
    ProductImage,
    ProductVariant,
    User,
    UserRole,
)
from app.utils.slugify import slugify

NOW = datetime.now(timezone.utc)
IMG = "https://picsum.photos/seed/{seed}/800/800"

CATEGORIES = [
    ("Electronics", "electronics", 0),
    ("Apparel", "apparel", 1),
    ("Accessories", "accessories", 2),
    ("Home & Kitchen", "home-kitchen", 3),
]

# (name, category_slug, description, base_price_paise)
PRODUCTS = [
    ("Wireless Earbuds Pro", "electronics", "Active-noise-cancelling earbuds with 28h battery, fast charge and IPX5 sweat resistance.", 499900),
    ("Smart Watch Fit 2", "electronics", 'Heart rate, SpO2, sleep tracking and a 1.7" AMOLED display with 10-day battery.', 799900),
    ("Bluetooth Speaker Mini", "electronics", "Compact 360° sound, 12h playtime, waterproof IPX7.", 299900),
    ("USB-C Fast Charger 65W", "electronics", "GaN charger with dual USB-C and one USB-A port.", 249900),
    ("Air Purifier Compact", "electronics", "HEPA-13 filter covering 20 m², near-silent night mode.", 899900),
    ("Merino Crew T-Shirt", "apparel", "Lightweight merino tee, naturally breathable and odour resistant.", 149900),
    ("Oxford Casual Shirt", "apparel", "Everyday cotton oxford with a tailored-but-relaxed fit.", 199900),
    ("Denim Jacket Classic", "apparel", "Stone-washed 12oz denim with brass hardware.", 349900),
    ("Jogger Sweatpants", "apparel", "Brushed fleece interior, tapered fit, zip pockets.", 179900),
    ("Leather Bifold Wallet", "accessories", "Full-grain leather bifold with RFID shielding.", 129900),
    ("Polarized Sunglasses", "accessories", "UV400 polarized lenses on a lightweight TR-90 frame.", 199900),
    ("Everyday Sling Bag", "accessories", "Water-resistant canvas sling with a padded tablet sleeve.", 249900),
    ("Steel Temperature Bottle", "accessories", "Vacuum-insulated 750ml bottle — 24h cold, 12h hot.", 159900),
    ("Desk Organizer Bamboo", "accessories", "Modular bamboo desk organizer with soft-close drawers.", 149900),
    ("Ceramic Pour-Over Set", "home-kitchen", "Stoneware dripper with a 500ml matching carafe.", 299900),
    ("Chef's Knife 20cm", "home-kitchen", "High-carbon stainless steel, full tang, balanced bolster.", 399900),
    ("Cotton Throw Blanket", "home-kitchen", "Double-layer cotton weave, king size, machine washable.", 249900),
    ("Scented Soy Candle Trio", "home-kitchen", "Slow-burning soy candles: vanilla, sandalwood, citrus.", 119900),
    ("Linen Bed Sheet Set", "home-kitchen", "100% French flax linen, queen size, double stitched.", 599900),
]

SIZES = [("Small", "S"), ("Medium", "M"), ("Large", "L"), ("Extra Large", "XL")]
COLORS = [("Black", "BLK"), ("White", "WHT"), ("Navy", "NAV"), ("Crimson", "CRM")]


def sku_for(slug: str, suffix: str) -> str:
    return f"{slug.upper().replace('-', '')[:12]}-{suffix}"


async def seed_admin(db) -> None:
    settings = get_settings()
    if not settings.seed_admin_email:
        return
    exists = await db.scalar(select(User.id).where(User.email == settings.seed_admin_email))
    if exists:
        return
    db.add(
        User(
            email=settings.seed_admin_email.lower(),
            hashed_password=hash_password(settings.seed_admin_password or "Admin1234"),
            full_name="Store Admin",
            role=UserRole.ADMIN,
            email_verified_at=NOW,
        )
    )
    print(f"+ admin {settings.seed_admin_email}")


async def seed_categories(db) -> dict[str, Category]:
    out: dict[str, Category] = {}
    for name, slug, sort in CATEGORIES:
        c = await db.scalar(select(Category).where(Category.slug == slug))
        if c is None:
            c = Category(name=name, slug=slug, sort_order=sort)
            db.add(c)
            await db.flush()
            print(f"+ category {slug}")
        out[slug] = c
    return out


async def seed_products(db, cats: dict[str, Category]) -> list[Product]:
    random.seed(42)
    created: list[Product] = []
    for name, cat_slug, description, base_price in PRODUCTS:
        slug = slugify(name)
        if await db.scalar(select(Product.id).where(Product.slug == slug)):
            continue
        product = Product(
            name=name, slug=slug, description=description, category_id=cats[cat_slug].id
        )
        db.add(product)
        await db.flush()

        db.add(ProductImage(product_id=product.id, url=IMG.format(seed=f"{slug}a"), alt_text=name, sort_order=0))
        db.add(ProductImage(product_id=product.id, url=IMG.format(seed=f"{slug}b"), alt_text=f"{name} — detail view", sort_order=1))

        apparel = cat_slug == "apparel"
        if apparel:
            for (cname, ccode), (sname, scode) in zip(random.sample(COLORS, 2), random.sample(SIZES, 2)):
                price = base_price + random.randint(0, 3) * 10000
                db.add(ProductVariant(
                    product_id=product.id,
                    name=f"{cname} / {sname}",
                    sku=sku_for(slug, f"{scode}{ccode}"),
                    price=price,
                    compare_at_price=price + 40000 if random.random() < 0.4 else None,
                    stock=random.randint(0, 24),
                    attributes={"color": cname.lower(), "size": sname.lower()},
                    weight_grams=random.randint(180, 520),
                ))
        else:
            n_variants = random.choice([1, 2])
            for v in range(n_variants):
                price = base_price + v * 50000
                db.add(ProductVariant(
                    product_id=product.id,
                    name="Standard" if n_variants == 1 else f"Pack of {v + 1}",
                    sku=sku_for(slug, f"V{v + 1}"),
                    price=price,
                    compare_at_price=price + 30000 if random.random() < 0.3 else None,
                    stock=random.randint(0, 18),
                    attributes={},
                    weight_grams=random.randint(120, 1600),
                ))
        created.append(product)
        print(f"+ product {slug}")
    return created


async def seed_coupon(db) -> None:
    if await db.scalar(select(Coupon.id).where(Coupon.code == "WELCOME10")):
        return
    db.add(
        Coupon(
            code="WELCOME10",
            discount_type=DiscountType.PERCENT,
            value=10,
            min_order_value=50000,
            max_uses=1000,
            per_user_limit=1,
            is_active=True,
        )
    )
    print("+ coupon WELCOME10")


async def seed_demo_orders(db) -> None:
    """~120 orders over the last 60 days spread across 6 demo customers."""
    settings = get_settings()
    customers: list[User] = []
    for i in range(1, 7):
        email = f"demo.customer{i}@example.com"
        u = await db.scalar(select(User).where(User.email == email))
        if u is None:
            u = User(
                email=email,
                hashed_password=hash_password("Demo1234"),
                full_name=f"Demo Customer {i}",
                email_verified_at=NOW,
            )
            db.add(u)
            await db.flush()
        customers.append(u)

    from sqlalchemy import func

    product_rows = (
        await db.execute(select(Product).options(_loads()))
    ).scalars().all()
    paid_products = [p for p in product_rows if any(v.stock for v in p.variants)]
    seq = int(await db.scalar(select(func.count(Order.id))) or 0)

    for k in range(120):
        days_ago = random.randint(0, 60)
        paid_at = NOW - timedelta(days=days_ago, hours=random.randint(0, 20))
        product = random.choice(paid_products)
        variant = random.choice([v for v in product.variants if v.stock and v.is_active])
        qty = random.randint(1, 3)
        subtotal = variant.price * qty
        discount = 0
        shipping = 0 if subtotal >= settings.free_shipping_threshold else settings.flat_shipping_fee
        tax = 0
        total = subtotal - discount + shipping + tax
        seq += 1
        user = random.choice(customers)
        order = Order(
            order_number=f"EC-DEMO-{seq:06d}",
            user_id=user.id,
            status=OrderStatus.DELIVERED,
            subtotal=subtotal, discount=discount, shipping_fee=shipping, tax=tax, total=total,
            currency=settings.currency,
            shipping_address={"name": user.full_name, "line1": f"{seq} Demo Street", "city": "Mumbai", "state": "MH", "postal_code": "400001", "country": "IN", "phone": "+919000000000"},
            paid_at=paid_at,
        )
        db.add(order)
        await db.flush()
        db.add(OrderItem(
            order_id=order.id, product_variant_id=variant.id,
            product_name=product.name, variant_name=variant.name, sku=variant.sku,
            image_url=f"https://picsum.photos/seed/{product.slug}a/800/800",
            unit_price=variant.price, quantity=qty, line_total=subtotal,
        ))
        db.add(Payment(
            order_id=order.id, kind=PaymentKind.GATEWAY,
            provider_order_id=f"demo_order_{uuid.uuid4().hex[:12]}",
            provider_payment_id=f"demo_pay_{uuid.uuid4().hex[:12]}",
            amount=total, status=PaymentStatus.CAPTURED, raw_payload={"demo": True},
        ))
    print("+ 120 demo orders (60 days) for analytics")


def _loads():
    from sqlalchemy.orm import selectinload
    return selectinload(Product.variants)


async def main_async(with_demo_orders: bool) -> None:
    async with SessionLocal() as db:
        await seed_admin(db)
        cats = await seed_categories(db)
        await seed_products(db, cats)
        await seed_coupon(db)
        if with_demo_orders:
            await seed_demo_orders(db)
        await db.commit()
    print("seed complete")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--with-demo-orders", action="store_true", help="seed fake paid orders for analytics")
    args = parser.parse_args()
    asyncio.run(main_async(args.with_demo_orders))


if __name__ == "__main__":
    main()
