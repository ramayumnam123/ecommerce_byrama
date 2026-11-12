"""One-off cleanup: deactivate smoke-test leftovers so the Phase 2 baseline
(19 active products, 4 root categories) holds again for regression suites."""
import asyncio

import asyncpg

DSN = "postgresql://postgres:1234@localhost:5432/ecommerce"


async def go() -> None:
    conn = await asyncpg.connect(DSN)
    try:
        await conn.execute(
            "UPDATE products SET is_active = false, deleted_at = now() "
            "WHERE name LIKE 'Smoke Admin Product %' AND deleted_at IS NULL"
        )
        await conn.execute(
            "UPDATE product_variants SET is_active = false, stock = 0 "
            "WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'Smoke Admin Product %') "
            "AND is_active = true"
        )
        await conn.execute(
            "UPDATE categories SET is_active = false "
            "WHERE name LIKE 'Admin Smoke Cat %' OR name LIKE 'Admin Smoke Sub %' "
            "OR name LIKE 'adMn sMoKe cAt %' OR name LIKE 'admn smoke cat %'"
        )
        roots = await conn.fetchval(
            "SELECT count(*) FROM categories WHERE is_active AND parent_id IS NULL"
        )
        products = await conn.fetchval(
            "SELECT count(*) FROM products WHERE deleted_at IS NULL AND is_active = true"
        )
        print(f"roots: {roots}, active products: {products}")
    finally:
        await conn.close()


asyncio.run(go())
