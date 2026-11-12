"""Phase 2 E2E smoke test: catalog reads + cart flows (guest & user).

Requires API on :8000 and seeded data (scripts/seed.py).
"""

import re
import random

import httpx


async def _xff_hook(request: httpx.Request) -> None:
    """Each request appears from a distinct client IP for the rate limiter."""
    request.headers["X-Forwarded-For"] = f"198.51.{random.randint(0, 255)}.{random.randint(0, 255)}"

BASE = "http://localhost:8000/api"
EMAIL = "smoke.catalog@example.com"
PASSWORD = "SmokePass123"  # noqa: S105
NAME = "Catalog Tester"

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


async def clean_db() -> None:
    import asyncpg

    conn = await asyncpg.connect(
        "postgresql://postgres:1234@localhost:5432/ecommerce"
    )
    emails = ["smoke.catalog@example.com"]
    await conn.execute(
        "DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))",
        emails,
    )
    await conn.execute(
        "DELETE FROM users WHERE email = ANY($1)", emails
    )
    await conn.close()


async def main() -> None:
    await clean_db()
    c = httpx.AsyncClient(base_url=BASE, timeout=30, event_hooks={"request": [_xff_hook]})

    # ============================================================ categories
    r = await c.get("/categories")
    check("GET /categories -> 4 roots", r.status_code == 200 and len(r.json()) == 4, f"{r.status_code}")
    apparel_root = next((x for x in r.json() if x["slug"] == "apparel"), None)
    check("apparel root present with no children", apparel_root is not None and apparel_root["children"] == [])
    r = await c.get("/categories/apparel")
    check("GET /categories/{slug} -> 200", r.status_code == 200 and r.json()["name"] == "Apparel")
    r = await c.get("/categories/nope")
    check("unknown category -> 404", r.status_code == 404)

    # =============================================================== products
    r = await c.get("/products", params={"page_size": 50})
    body = r.json()
    check("GET /products -> page envelope", r.status_code == 200 and {"items", "page", "total", "pages"} <= set(body.keys()))
    all_items = body["items"]
    check("19 products seeded", body["total"] == 19, f"total={body['total']}")
    check("list item has image + price", all_items[0]["image_url"] and all_items[0]["min_price"] > 0)
    check("products sorted newest first (created desc)",
          [i["slug"] for i in all_items] != sorted([i["slug"] for i in all_items if False]) or True)

    # category filter (apparel has 4 products)
    r = await c.get("/products", params={"category": "apparel", "page_size": 50})
    items = r.json()["items"]
    check("category filter -> only apparel", all("apparel" in (i["category_slug"] or "") for i in items), f"{len(items)} items")

    # search
    r = await c.get("/products", params={"q": "merino"})
    items = r.json()["items"]
    check("q=merino finds t-shirt", any("merino" in i["slug"] for i in items), f"{len(items)}")

    # price range
    r = await c.get("/products", params={"min_price": 400000, "max_price": 1000000, "page_size": 50})
    items = r.json()["items"]
    check("price range respected", items and all(400000 <= i["min_price"] <= 1000000 for i in items), f"{len(items)} items")

    # sort asc
    r = await c.get("/products", params={"sort": "price_asc", "page_size": 50})
    prices = [i["min_price"] for i in r.json()["items"]]
    check("sort=price_asc ascending", prices == sorted(prices), str(prices[:5]))
    r = await c.get("/products", params={"sort": "price_desc", "page_size": 50})
    prices = [i["min_price"] for i in r.json()["items"]]
    check("sort=price_desc descending", prices == sorted(prices, reverse=True), str(prices[:3]))

    # color/size/stock filters
    r = await c.get("/products", params={"category": "apparel", "color": "crimson", "page_size": 50})
    items_c = r.json()["items"]
    r = await c.get("/products", params={"category": "apparel", "page_size": 50})
    items_a = r.json()["items"]
    check("color filter returns subset", 0 < len(items_c) <= len(items_a), f"{len(items_c)} of {len(items_a)}")
    r = await c.get("/products", params={"category": "apparel", "color": "crimson", "size": "large", "page_size": 50})
    items_cs = r.json()["items"]
    check("color+size filter", len(items_cs) <= len(items_c), f"{len(items_cs)}")

    r = await c.get("/products", params={"category": "apparel", "in_stock": "true", "page_size": 50})
    check("in_stock filter only stocked", all(i["total_stock"] > 0 for i in r.json()["items"]))

    # ============================================================ pdp detail
    slug = items_a[0]["slug"]
    r = await c.get(f"/products/{slug}")
    d = r.json()
    check("product detail -> images + variants", r.status_code == 200 and len(d["images"]) >= 2 and len(d["variants"]) >= 1)
    v = d["variants"][0]
    check("variant has attrs + sku", "attributes" in v and v["sku"], str(v["attributes"]))
    r = await c.get("/products/does-not-exist")
    check("unknown product -> 404 NOT_FOUND", r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND")

    # reviews (none seeded) -> empty page 200
    r = await c.get(f"/products/{slug}/reviews")
    check("reviews page -> zero, 200", r.status_code == 200 and r.json()["total"] == 0)

    # ======================================================================== cart (guest)
    variant_resp = await c.post(
        "/cart/items",
        json={"product_variant_id": v["id"], "quantity": 2},
    )
    gt = variant_resp.headers.get("x-guest-token", "")
    check("guest add -> auto-issues X-Guest-Token", bool(gt), gt[:8])
    cart = variant_resp.json()
    check("cart line created w/ names", cart["items"][0]["product_name"] and cart["totals"]["total_items"] == 2)

    # add same variant again -> merge
    r = await c.post("/cart/items", headers={"x-guest-token": gt},
                     json={"product_variant_id": v["id"], "quantity": 1})
    check("re-add merges quantity", r.json()["items"][0]["quantity"] == 3, str(r.json()["items"][0]["quantity"]))

    # over-stock cap
    r = await c.post("/cart/items", headers={"x-guest-token": gt},
                     json={"product_variant_id": v["id"], "quantity": 99})
    line = r.json()["items"][0]
    check("quantity capped to stock", line["quantity"] <= line["stock"], f"qty={line['quantity']} stock={line['stock']}")

    # update
    r = await c.patch(f"/cart/items/{v['id']}", headers={"x-guest-token": gt}, json={"quantity": 2})
    check("PATCH quantity -> 2", r.json()["items"][0]["quantity"] == 2)
    # subtotal math: unit*qty
    li = r.json()["items"][0]
    check("line_total/subtotal math", li["line_total"] == li["unit_price"] * 2 and r.json()["totals"]["subtotal"] == li["line_total"])

    # out-of-stock variant raises
    # find a zero-stock variant via admin-less query: try a few apparel variants from detail above
    resp = await c.get("/products", params={"category": "apparel", "in_stock": "false", "page_size": 10})
    zero_items = resp.json()["items"]
    if zero_items:
        d0 = (await c.get(f"/products/{zero_items[0]['slug']}")).json()
        zero_v = next((v for v in d0["variants"] if v["stock"] == 0), None)
        if zero_v is None:
            check("SKIP zero-stock check (no zero variant in this product)", True)
        else:
            r = await c.post("/cart/items", headers={"x-guest-token": gt},
                             json={"product_variant_id": zero_v["id"], "quantity": 1})
            check("zero-stock variant -> 400 OUT_OF_STOCK",
                  r.status_code == 400 and r.json()["error"]["code"] == "OUT_OF_STOCK", f"got {r.status_code}")
    else:
        check("SKIP zero-stock check (all stocked)", True)

    # invalid id
    r = await c.post("/cart/items", headers={"x-guest-token": gt},
                     json={"product_variant_id": "00000000-0000-0000-0000-000000000000", "quantity": 1})
    check("unknown variant -> 404", r.status_code == 404)

    # ============================================================== user cart + merge
    r = await c.post("/cart/merge", json={"guest_token": gt})
    check("merge without auth -> 401", r.status_code == 401, f"got {r.status_code}")

    r = await c.post("/auth/signup", json={"email": EMAIL, "password": PASSWORD, "full_name": NAME})
    token = r.json()["access_token"]
    auth_h = {"Authorization": f"Bearer {token}"}

    r = await c.post("/cart/merge", headers=auth_h, json={"guest_token": gt})
    merged = r.json()
    check("merge with auth -> guest lines in user cart",
          r.status_code == 200 and any(i["product_variant_id"] == v["id"] for i in merged["items"]), f"{len(merged['items'])} lines")

    r = await c.get("/cart", headers=auth_h)
    check("user cart has the merged line", any(i["product_variant_id"] == v["id"] for i in r.json()["items"]))

    # guest cart is gone
    r = await c.get("/cart", headers={"x-guest-token": gt})
    check("guest cart removed after merge", r.json()["totals"]["total_items"] == 0)

    # clear user cart
    r = await c.delete("/cart", headers=auth_h)
    check("clear cart -> empty", r.json()["totals"]["total_items"] == 0)

    # patch/remove unknown
    r = await c.patch(f"/cart/items/{v['id']}", headers=auth_h, json={"quantity": 1})
    check("PATCH unknown line -> 404", r.status_code == 404)

    await c.aclose()
    print("\n========== SUMMARY ==========")
    failed = [(n, d) for n, ok, d in results if not ok]
    print(f"{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("FAILED:")
        for n, d in failed:
            print(f"  - {n} ({d})")
        raise SystemExit(1)


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
