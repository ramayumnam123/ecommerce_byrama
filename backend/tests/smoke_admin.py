"""Phase 4 e2e: admin auth gate, product/category/variant/image CRUD, coupons,
admin order management (ship/cancel/refund state machine), users admin, audit.

Uses fresh random entities per run. Requires API on :8000 with seeded catalog
and WELCOME10 coupon; runs in Razorpay mock mode.
"""

import random

import asyncpg
import httpx


async def _xff_hook(request: httpx.Request) -> None:
    """Each request appears from a distinct client IP for the rate limiter."""
    request.headers["X-Forwarded-For"] = f"198.51.{random.randint(0, 255)}.{random.randint(0, 255)}"

BASE = "http://localhost:8000/api"
ADMIN_EMAIL = "admin@local.dev"
ADMIN_PASSWORD = "Admin1234"  # noqa: S105
SALT = random.randint(10**6, 10**9)
CUSTOMER_EMAIL = f"admin.smoke{SALT}@example.com"
PASSWORD = "SmokePass123"  # noqa: S105
IMG_URL = "https://picsum.photos/seed/admin{SALT}/800/800"

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


async def main() -> None:
    c = httpx.AsyncClient(base_url=BASE, timeout=30, event_hooks={"request": [_xff_hook]})

    # ------------------------------------------------------- admin gate & login
    r = await c.post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    check("admin login", r.status_code == 200 and r.json().get("access_token"), r.text[:120])
    ADMIN = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = await c.post("/auth/signup", json={"email": CUSTOMER_EMAIL, "password": PASSWORD, "full_name": "Admin Smoke Customer"})
    CUSTOMER = {"Authorization": f"Bearer {r.json()['access_token']}"}
    customer_id = (await c.get("/auth/me", headers=CUSTOMER)).json()["id"]
    # checkout requires verified email → flip it directly in DB (dev shortcut)
    import asyncpg as _apg

    _conn = await _apg.connect("postgresql://postgres:1234@localhost:5432/ecommerce")
    await _conn.execute("UPDATE users SET email_verified_at = now() WHERE email = $1", CUSTOMER_EMAIL)
    await _conn.close()
    await c.post("/users/addresses", headers=CUSTOMER,
                 json={"line1": "1 Admin St", "city": "Pune", "state": "MH",
                       "postal_code": "411001", "country": "IN", "phone": "+919000000001"})

    r = await c.get("/admin/products", headers=CUSTOMER)
    check("non-admin -> 403", r.status_code == 403, f"{r.status_code}")
    r = await c.get("/admin/products")
    check("anon -> 401", r.status_code == 401, f"{r.status_code}")

    r = await c.get("/admin/products", headers=ADMIN)
    check("admin list products", r.status_code == 200 and r.json()["total"] >= 19, f"{r.json().get('total')}")

    # ---------------------------------------------------------------- categories
    r = await c.post("/admin/categories", headers=ADMIN,
                     json={"name": f"Admin Smoke Cat {SALT}"})
    check("category create", r.status_code == 201 and r.json()["slug"], r.text[:100])
    category_id = r.json()["id"]

    r = await c.post("/admin/categories", headers=ADMIN,
                     json={"name": f"Admin Smoke Sub {SALT}", "parent_id": category_id})
    check("sub category parented", r.status_code == 201 and r.json()["parent_id"] == category_id, r.text[:100])
    sub_id = r.json()["id"]

    r = await c.post("/admin/categories", headers=ADMIN, json={"name": f"Admin Smoke Cat {SALT}"})
    dup = r.json()
    check("duplicate category name -> unique slug (201)", r.status_code == 201
          and dup["slug"] == f"admin-smoke-cat-{SALT}-2", f"{r.status_code} slug={dup.get('slug')}")
    r = await c.delete(f"/admin/categories/{dup['id']}", headers=ADMIN)
    check("cleanup duplicate category", r.status_code == 204, f"{r.status_code}")

    r = await c.delete(f"/admin/categories/{category_id}", headers=ADMIN)
    check("delete category with child -> 409 CATEGORY_IN_USE", r.status_code == 409, f"{r.status_code}")

    r = await c.patch(f"/admin/categories/{sub_id}", headers=ADMIN, json={"is_active": False})
    check("deactivate subcategory", r.status_code == 200 and r.json()["is_active"] is False)

    r = await c.delete(f"/admin/categories/{sub_id}", headers=ADMIN)
    check("delete empty subcategory -> 204", r.status_code == 204, f"{r.status_code}")

    # ------------------------------------------------------------------ products
    product_body = {
        "name": f"Smoke Admin Product {SALT}",
        "description": "Created by the Phase 4 e2e suite",
        "category_id": category_id,
        "images": [{"url": IMG_URL, "alt_text": "front"}],
        "variants": [
            {"name": "Standard", "price": 199900, "stock": 7, "attributes": {"color": "black"}},
            {"name": "Pack of 2", "price": 329900, "stock": 3},
        ],
    }
    r = await c.post("/admin/products", headers=ADMIN, json=product_body)
    check("product create w/ auto slug+sku", r.status_code == 201
          and r.json()["slug"] == f"smoke-admin-product-{SALT}"
          and all(len(v["sku"]) >= 4 for v in r.json()["variants"]), r.text[:200])
    product_id = r.json()["id"]
    v1, v2 = r.json()["variants"][0], r.json()["variants"][1]

    r = await c.post("/admin/products", headers=ADMIN, json=product_body)
    check("duplicate product name -> unique slug, 201", r.status_code == 201
          and r.json()["slug"] == f"smoke-admin-product-{SALT}-2", r.text[:120])
    await c.delete(f"/admin/products/{r.json()['id']}", headers=ADMIN)

    # variant ops
    r = await c.post(f"/admin/products/{product_id}/variants", headers=ADMIN,
                     json={"name": "Pack of 3", "price": 489900, "stock": 1})
    check("add variant", r.status_code == 201 and r.json()["variant_count"] == 3, r.text[:80])
    v3 = r.json()["variants"][2]

    r = await c.patch(f"/admin/products/variants/{v1['id']}", headers=ADMIN,
                      json={"stock": 12, "price": 189900})
    got = next(v for v in r.json()["variants"] if v["id"] == v1["id"])
    check("variant stock/price edit", got["stock"] == 12 and got["price"] == 189900)

    r = await c.patch(f"/admin/products/variants/{v1['id']}", headers=ADMIN,
                      json={"compare_at_price": 100000})
    check("compare_at < price -> 400", r.status_code == 400, f"{r.status_code}")

    r = await c.delete(f"/admin/products/variants/{v2['id']}", headers=ADMIN)
    check("delete never-sold variant -> 204", r.status_code == 204, f"{r.status_code}")

    # sell v1 twice → variant delete must 409
    await _buy_once(c, CUSTOMER, v1)  # PENDING → cancel (restock)
    await _buy_once(c, CUSTOMER, v1)  # PENDING this time
    r = await c.delete(f"/admin/products/variants/{v1['id']}", headers=ADMIN)
    check("delete sold variant -> 409 VARIANT_SOLD", r.status_code == 409
          and r.json()["error"]["code"] == "VARIANT_SOLD", f"{r.status_code}")

    # images reorder — list order defines sort_order (schema takes url + alt_text)
    r = await c.post(f"/admin/products/{product_id}/images", headers=ADMIN,
                     json={"images": [{"url": IMG_URL + "b", "alt_text": "back"},
                                      {"url": IMG_URL, "alt_text": "front"}]})
    check("replace images (reorder)", r.status_code == 200
          and [i["url"].endswith("b") for i in r.json()["images"]] == [True, False], r.text[:120])

    # list include_deleted + soft delete
    r = await c.patch(f"/admin/products/{product_id}", headers=ADMIN, json={"is_active": False})
    check("patch product is_active", r.status_code == 200 and r.json()["is_active"] is False)
    r = await c.delete(f"/admin/products/{product_id}", headers=ADMIN)
    check("soft delete product -> 204", r.status_code == 204)
    r = await c.get("/admin/products", headers=ADMIN, params={"include_deleted": "true", "q": f"smoke-admin-product-{SALT}"})
    both = r.json()["items"]
    check("include_deleted shows both soft-deleted", r.json()["total"] == 2
          and all(i["deleted_at"] is not None for i in both), r.text[:200])
    r = await c.get("/admin/products", headers=ADMIN, params={"q": f"smoke-admin-product-{SALT}"})
    check("default list hides deleted", r.json()["total"] == 0, f"{r.json()['total']}")

    # -------------------------------------------------------------------- orders
    # fresh pending order from the customer to ship/refund on
    live = (await c.get("/products", params={"in_stock": "true", "page_size": 5})).json()
    variant_id = None
    for item in live["items"]:
        d = (await c.get(f"/products/{item['slug']}")).json()
        with_stock = [v for v in d["variants"] if v["stock"] > 1]
        if with_stock:
            variant_id = with_stock[0]["id"]
            break
    r = await c.post("/cart/items", headers=CUSTOMER, json={"product_variant_id": variant_id, "quantity": 1})
    addr = (await c.get("/users/addresses", headers=CUSTOMER)).json()
    start_body = {"address_id": addr[0]["id"]}
    admin_order_id = None
    r = await c.post("/checkout/start", headers=CUSTOMER, json=start_body)
    admin_order_id = r.json()["order"]["id"]
    check("customer order for admin flow", admin_order_id is not None, r.text[:150])

    r = await c.get("/admin/orders", headers=ADMIN, params={"status": "PENDING", "q": CUSTOMER_EMAIL})
    found = [o for o in r.json()["items"] if o["id"] == admin_order_id]
    check("admin orders filter (status+email)", r.status_code == 200 and len(found) == 1, r.text[:120])
    check("admin lite order has item_count", found[0]["item_count"] == 1)

    r = await c.get(f"/admin/orders/{admin_order_id}", headers=ADMIN)
    detail = r.json()
    check("admin order detail w/ payment+address", detail["payment"] is not None
          and detail["shipping_address"]["city"] == "Pune")

    # ship before payment → 409
    r = await c.patch(f"/admin/orders/{admin_order_id}/status", headers=ADMIN,
                      json={"status": "SHIPPED", "tracking_number": "TRK-77", "carrier": "DTDC"})
    check("PENDING->SHIPPED illegal -> 409", r.status_code == 409, f"{r.status_code}")

    # capture via mock-pay, from admin we now pay through customer's rzp mock flow
    rzp_order_id = detail["payment"]["provider_order_id"]
    r = await c.post(f"/checkout/mock-pay?razorpay_order_id={rzp_order_id}", headers=CUSTOMER)
    check("customer mock-pay ok", r.status_code == 200 and r.json()["status"] == "PAID", r.text[:100])

    # ---- ship
    r = await c.patch(f"/admin/orders/{admin_order_id}/status", headers=ADMIN,
                      json={"status": "SHIPPED", "tracking_number": "TRK-77", "carrier": "DTDC"})
    check("PAID->SHIPPED w/ tracking", r.status_code == 200 and r.json()["status"] == "SHIPPED"
          and r.json()["tracking_number"] == "TRK-77", r.text[:120])

    # ---- cancel shipped → 409
    r = await c.patch(f"/admin/orders/{admin_order_id}/status", headers=ADMIN, json={"status": "CANCELLED"})
    check("SHIPPED->CANCELLED illegal -> 409", r.status_code == 409, f"{r.status_code}")

    # ---- deliver
    r = await c.patch(f"/admin/orders/{admin_order_id}/status", headers=ADMIN, json={"status": "DELIVERED"})
    check("SHIPPED->DELIVERED", r.status_code == 200 and r.json()["status"] == "DELIVERED")

    # ---- refund (mock gateway)
    total = (await c.get(f"/admin/orders/{admin_order_id}", headers=ADMIN)).json()["total"]
    r = await c.post(f"/admin/orders/{admin_order_id}/refund", headers=ADMIN,
                     json={"amount": total + 1, "reason": "too much"})
    check("refund over balance -> 400", r.status_code == 400, f"{r.status_code}")
    half = total // 2
    r = await c.post(f"/admin/orders/{admin_order_id}/refund", headers=ADMIN,
                     json={"amount": half, "reason": "goodwill gesture"})
    body = r.json()
    check("partial refund keeps DELIVERED + refund_amount", r.status_code == 200
          and body["status"] == "DELIVERED" and body["refund_amount"] == half, r.text[:200])
    r = await c.post(f"/admin/orders/{admin_order_id}/refund", headers=ADMIN,
                     json={"amount": total - half, "reason": "second half"})
    body = r.json()
    check("full refund -> REFUNDED", r.status_code == 200 and body["status"] == "REFUNDED"
          and body["refund_amount"] == total, r.text[:200])
    # final state read-only
    r = await c.patch(f"/admin/orders/{admin_order_id}/status", headers=ADMIN, json={"status": "SHIPPED"})
    check("REFUNDED final -> 409", r.status_code == 409, f"{r.status_code}")

    # cancel-PAID path (fresh pending → capture → admin cancel → refund+restock)
    r = await c.post("/cart/items", headers=CUSTOMER, json={"product_variant_id": variant_id, "quantity": 1})
    r = await c.post("/checkout/start", headers=CUSTOMER, json=start_body)
    start2 = r.json()
    o2 = start2["order"]
    stock_before = await _stock(variant_id)  # reservation already taken at start
    r = await c.post(f"/checkout/mock-pay?razorpay_order_id={start2['razorpay']['order_id']}", headers=CUSTOMER)
    r = await c.patch(f"/admin/orders/{o2['id']}/status", headers=ADMIN, json={"status": "CANCELLED"})
    stock_after = await _stock(variant_id)
    check("admin cancel PAID -> REFUND row+refund_amount+restock",
          r.status_code == 200 and r.json()["status"] == "CANCELLED"
          and r.json()["refund_amount"] == r.json()["total"] and stock_after == stock_before + 1,
          r.text[:200])
    pay_detail = (await c.get(f"/admin/orders/{o2['id']}", headers=ADMIN)).json()
    check("refund payment row exists", bool(pay_detail.get("payment")), str(pay_detail.get("payment")))

    # ------------------------------------------------------------------- coupons
    code = f"SMOKE{SALT}"
    r = await c.post("/admin/coupons", headers=ADMIN,
                     json={"code": code, "discount_type": "FIXED", "value": 50000,
                           "min_order_value": 100000})
    check("coupon create", r.status_code == 201 and r.json()["code"] == code, r.text[:120])
    coupon_id = r.json()["id"]
    r = await c.post("/admin/coupons", headers=ADMIN,
                     json={"code": code, "discount_type": "FIXED", "value": 1})
    check("duplicate coupon code -> 409", r.status_code == 409)
    r = await c.post("/admin/coupons", headers=ADMIN,
                     json={"code": code + "X", "discount_type": "PERCENT", "value": 150})
    check("percent > 100 -> 422", r.status_code in (400, 422), f"{r.status_code}")
    r = await c.patch(f"/admin/coupons/{coupon_id}", headers=ADMIN, json={"is_active": False})
    check("coupon deactivate", r.status_code == 200 and r.json()["is_active"] is False)
    r = await c.delete(f"/admin/coupons/{coupon_id}", headers=ADMIN)
    check("unused coupon delete", r.status_code == 204, f"{r.status_code}")
    # WELCOME10 has 3 redemptions → delete must 409
    welcome = (await c.get("/admin/coupons", headers=ADMIN)).json()["items"]
    w = next(x for x in welcome if x["code"] == "WELCOME10")
    r = await c.delete(f"/admin/coupons/{w['id']}", headers=ADMIN)
    check("used coupon delete -> 409 COUPON_IN_USE", r.status_code == 409, f"{r.status_code}")
    r = await c.get(f"/admin/coupons/{w['id']}/usages", headers=ADMIN)
    check("coupon usages list", r.status_code == 200 and r.json()["total"] >= 3
          and all("order_number" in u for u in r.json()["items"]), str(r.json()["total"]))

    # --------------------------------------------------------------------- users
    r = await c.get("/admin/users", headers=ADMIN, params={"q": CUSTOMER_EMAIL, "role": "CUSTOMER"})
    check("admin users filter", r.status_code == 200 and r.json()["total"] == 1
          and r.json()["items"][0]["orders_count"] >= 1, r.text[:150])
    r = await c.patch(f"/admin/users/{customer_id}", headers=ADMIN, json={"is_active": False})
    check("deactivate user", r.status_code == 200 and r.json()["is_active"] is False)
    r = await c.post("/auth/login", json={"email": CUSTOMER_EMAIL, "password": PASSWORD})
    check("deactivated user cannot login", r.status_code == 401, f"{r.status_code}")
    r = await c.patch(f"/admin/users/{customer_id}", headers=ADMIN, json={"is_active": True})
    check("reactivate user", r.status_code == 200 and r.json()["is_active"] is True)
    me = (await c.get("/auth/me", headers=ADMIN)).json()
    r = await c.patch(f"/admin/users/{me['id']}", headers=ADMIN, json={"role": "CUSTOMER"})
    check("self-demotion blocked -> 409", r.status_code == 409, f"{r.status_code}")

    # --------------------------------------------------------------------- audit
    r = await c.get("/admin/audit", headers=ADMIN, params={"entity_type": "order"})
    check("audit log feed", r.status_code == 200 and r.json()["total"] >= 5
          and {"action", "entity_type", "created_at", "actor_email"} <= set(r.json()["items"][0].keys()),
          str(r.json()["total"]))

    # leave no active catalog residue: retire the smoke category (products are
    # soft-deleted, so hard delete would 409)
    r = await c.patch(f"/admin/categories/{category_id}", headers=ADMIN, json={"is_active": False})
    check("cleanup main category", r.status_code == 200 and r.json()["is_active"] is False)

    await c.aclose()
    print("\n========== SUMMARY ==========")
    failed = [(n, d) for n, ok, d in results if not ok]
    print(f"{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("FAILED:")
        for n, d in failed:
            print(f"  - {n} ({d})")
        raise SystemExit(1)


async def _buy_once(c: httpx.AsyncClient, headers: dict, variant) -> None:
    """Place a PENDING order with the given variant (used to mark it sold)."""
    addr = (await c.get("/users/addresses", headers=headers)).json()
    await c.post("/cart/items", headers=headers, json={"product_variant_id": variant["id"], "quantity": 1})
    await c.post("/checkout/start", headers=headers, json={"address_id": addr[0]["id"]})


async def _stock(variant_id: str) -> int:
    conn = await asyncpg.connect("postgresql://postgres:1234@localhost:5432/ecommerce")
    try:
        return int(await conn.fetchval("SELECT stock FROM product_variants WHERE id = $1", variant_id))
    finally:
        await conn.close()


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
