"""Phase 3 e2e: addresses → cart → quote → start (stock reservation) → mock
payment → PAID (idempotent) → orders, cancel flow, coupon single-use, webhook
guard rails. Runs against the live API on :8000 in Razorpay mock mode.

Uses a fresh random account each run (no cleanup needed).
"""

import random

import asyncpg
import httpx


async def _xff_hook(request: httpx.Request) -> None:
    """Each request appears from a distinct client IP for the rate limiter."""
    request.headers["X-Forwarded-For"] = f"198.51.{random.randint(0, 255)}.{random.randint(0, 255)}"

BASE = "http://localhost:8000/api"
MARK = f"smoke{random.randint(1, 10**9)}@example.com"
PASSWORD = "SmokePass123"  # noqa: S105

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


async def db_exec(sql: str, *args):
    conn = await asyncpg.connect("postgresql://postgres:1234@localhost:5432/ecommerce")
    out = await conn.execute(sql, *args) if args else await conn.execute(sql)
    await conn.close()
    return out


async def db_scalar(sql: str, *args):
    conn = await asyncpg.connect("postgresql://postgres:1234@localhost:5432/ecommerce")
    out = await conn.fetchval(sql, *args)
    await conn.close()
    return out


async def main() -> None:
    c = httpx.AsyncClient(base_url=BASE, timeout=30, follow_redirects=True,
                          event_hooks={"request": [_xff_hook]})

    # ------------------------------------------------------------- signup+verify
    r = await c.post(
        "/auth/signup",
        json={"email": MARK, "password": PASSWORD, "full_name": "Checkout Tester"},
    )
    check("signup -> 201/token", r.status_code in (200, 201) and r.json().get("access_token"))
    token = r.json()["access_token"]
    auth_h = {"Authorization": f"Bearer {token}"}

    await db_exec(
        "UPDATE users SET email_verified_at = now() WHERE email = $1", MARK
    )

    r = await c.get("/auth/me", headers=auth_h)
    user_id = r.json()["id"]

    # ------------------------------------------------------- address CRUD + 409
    addr = {
        "line1": "12 MG Road", "city": "Bengaluru", "state": "KA",
        "postal_code": "560001", "country": "IN", "phone": "+919999900000",
    }
    r = await c.post("/users/addresses", headers=auth_h, json=addr)
    check("create address -> 201", r.status_code == 201, r.text[:80])
    address_id = r.json()["id"]
    r = await c.post("/users/addresses", headers=auth_h, json={**addr, "is_default": True})
    r2 = await c.get("/users/addresses", headers=auth_h)
    defaults = [a for a in r2.json() if a["is_default"]]
    check("default swap keeps one default", r.status_code == 201 and len(defaults) == 1)
    second_addr_id = r.json()["id"]

    # ------------------------------------------- email-unverified gate (checked on a virgin user)
    r = await c.post(
        "/auth/signup",
        json={"email": "unverified" + MARK, "password": PASSWORD, "full_name": "UV"},
    )
    vh = {"Authorization": f"Bearer {r.json()['access_token']}"}
    await c.post("/users/addresses", headers=vh, json=addr)
    await c.post(
        "/cart/items", headers=vh,
        json={"product_variant_id": await a_variant_id(), "quantity": 1},
    )
    r = await c.post(
        "/checkout/start",
        headers=vh,
        json={"address_id": (await c.get("/users/addresses", headers=vh)).json()[0]["id"]},
    )
    check("unverified email checkout -> 403 EMAIL_NOT_VERIFIED",
          r.status_code == 403 and r.json()["error"]["code"] == "EMAIL_NOT_VERIFIED", f"{r.status_code}")

    # ---------------------------------------------------------------- build cart
    detail = (await c.get("/products/merino-crew-t-shirt")).json()
    variant = detail["variants"][0]
    stock_before = await variant_stock(variant["id"])

    r = await c.post(
        "/cart/items", headers=auth_h,
        json={"product_variant_id": variant["id"], "quantity": 2},
    )
    check("user add 2x variant", r.status_code == 200 and r.json()["totals"]["total_items"] == 2)

    # guest cart via header, merged through checkout's guest_token
    earbuds = (await c.get("/products/wireless-earbuds-pro")).json()
    e_variant = earbuds["variants"][0]
    gt_session = httpx.AsyncClient(base_url=BASE, timeout=30,
                                   event_hooks={"request": [_xff_hook]})
    r = await gt_session.post("/cart/items", json={"product_variant_id": e_variant["id"], "quantity": 1})
    gt = r.headers["x-guest-token"]

    # ------------------------------------------------------------------- quote
    # NOTE: quote happens BEFORE the guest-merge at start → only user lines count
    r = await c.post(
        "/checkout/quote", headers=auth_h,
        json={"address_id": address_id, "coupon_code": "WELCOME10"},
    )
    user_subtotal = 2 * variant["price"]
    expected_user_discount = user_subtotal // 10
    expected_user_total = user_subtotal - expected_user_discount  # shipping 0 (>= threshold)
    q = r.json()
    check("quote totals (10% coupon, paise int)",
          r.status_code == 200 and q["subtotal"] == user_subtotal and q["discount"] == expected_user_discount
          and q["total"] == expected_user_total and q["shipping"] == 0,
          f"got {q}")

    # -------------------------------------------------------- start (reserves)
    orders_before = int(await db_scalar("SELECT count(*) FROM orders"))
    stock_before_e = await variant_stock(e_variant["id"])
    r = await c.post(
        "/checkout/start", headers=auth_h,
        json={"address_id": address_id, "coupon_code": "WELCOME10", "guest_token": gt},
    )
    body = r.json()
    order0 = body.get("order", {})
    check("start -> PENDING + razorpay mock block",
          r.status_code == 200 and order0.get("status") == "PENDING"
          and body["razorpay"]["order_id"].startswith("order_mock_") and body["razorpay"]["mock"] is True,
          f"{r.status_code} {r.text[:160]}")
    razorpay_order_id = body["razorpay"]["order_id"]
    order_id = order0["id"]

    subtotal = user_subtotal + e_variant["price"]
    expected_total = subtotal - subtotal // 10

    check("start merged guest cart line (2 items)",
          len(order0["items"]) == 2 and {i["sku"] for i in order0["items"]} ==
          {variant["sku"], e_variant["sku"]})
    check("order total matches quote", order0["total"] == expected_total,
          f"{order0['total']} vs {expected_total}")
    orders_after = int(await db_scalar("SELECT count(*) FROM orders"))
    check("order rows created exactly once", orders_after == orders_before + 1)
    stock_after = await variant_stock(variant["id"])
    stock_after_e = await variant_stock(e_variant["id"])
    check("stock reserved (decremented)",
          stock_after == stock_before - 2 and stock_after_e == stock_before_e - 1,
          f"{stock_before}->{stock_after}, {stock_before_e}->{stock_after_e}")
    r = await c.get("/cart", headers=auth_h)
    check("cart consumed by checkout", r.json()["totals"]["total_items"] == 0)
    r = await gt_session.get("/cart", headers={"x-guest-token": gt})
    check("guest cart merged away", r.json()["totals"]["total_items"] == 0)
    await gt_session.aclose()

    redeemed = await db_scalar(
        "SELECT used_count FROM coupons WHERE code = 'WELCOME10'"
    )
    check("coupon used_count incremented", int(redeemed) >= 1, str(redeemed))

    # ------------------------------------------------------ idempotent replay
    r = await c.post(
        "/checkout/start", headers={**auth_h, "Idempotency-Key": "reuse-later"},
        json={"address_id": address_id},  # cart is empty now — replay must bypass
    )
    check("cart-empty start without key -> 400 CART_EMPTY",
          r.status_code == 400 and r.json()["error"]["code"] == "CART_EMPTY", f"{r.status_code}")

    # ----------------------------------------------------------- mock capture
    r = await c.post(f"/checkout/mock-pay?razorpay_order_id={razorpay_order_id}", headers=auth_h)
    paid = r.json()
    check("mock-pay -> PAID", r.status_code == 200 and paid["status"] == "PAID"
          and paid["paid_at"] is not None and paid["payment"]["status"] == "CAPTURED",
          f"{r.status_code} {r.text[:120]}")

    # idempotent second capture
    r = await c.post(f"/checkout/mock-pay?razorpay_order_id={razorpay_order_id}", headers=auth_h)
    check("double capture stays idempotent", r.status_code == 200 and r.json()["status"] == "PAID",
          f"{r.status_code}")

    # ------------------------------------------------------------------ reads
    r = await c.get("/orders", headers=auth_h)
    check("my orders lists the order", r.status_code == 200 and r.json()["total"] == 1
          and r.json()["items"][0]["id"] == order_id, f"{r.status_code}")

    r = await c.get(f"/orders/{order_id}", headers=auth_h)
    check("order detail w/ items", r.status_code == 200 and len(r.json()["items"]) == 2)

    r = await c.post(f"/orders/{order_id}/cancel", headers=auth_h)
    check("cancel PAID -> 409 ORDER_STATE", r.status_code == 409
          and r.json()["error"]["code"] == "ORDER_STATE", f"{r.status_code}")

    # ------------------------------------------------- coupon single-use rule
    r = await c.post("/cart/items", headers=auth_h,
                     json={"product_variant_id": variant["id"], "quantity": 1})
    r = await c.post("/checkout/quote", headers=auth_h,
                     json={"address_id": address_id, "coupon_code": "welcome10"})
    check("per_user_limit -> 409 COUPON_USED", r.status_code == 409
          and r.json()["error"]["code"] == "COUPON_USED", f"{r.status_code} {r.text[:100]}")

    # ------------------------------------------------------- cancel PENDING flow
    stock_before2 = await variant_stock(variant["id"])
    r = await c.post("/checkout/start", headers=auth_h, json={"address_id": address_id})
    pend = r.json()["order"]
    check("second start (no coupon) ok", r.status_code == 200 and pend["status"] == "PENDING")
    check("no-coupon start has no discount", pend["discount"] == 0)
    stock_mid = await variant_stock(variant["id"])
    r = await c.post(f"/orders/{pend['id']}/cancel", headers=auth_h)
    cancelled = r.json()
    stock_after2 = await variant_stock(variant["id"])
    check("cancel PENDING restores stock",
          r.status_code == 200 and cancelled["status"] == "CANCELLED"
          and stock_after2 == stock_before2 and stock_mid == stock_before2 - 1,
          f"{stock_before2}->{stock_mid}->{stock_after2}")
    check("cancelled order payment marked FAILED", cancelled["payment"]["status"] == "FAILED")

    # ------------------------------------------------------------- webhook guard
    r = await c.post(
        "/webhooks/razorpay",
        content=b'{"event": "payment.captured"}',
        headers={"x-razorpay-signature": "deadbeef", "content-type": "application/json"},
    )
    check("webhook without configured secret -> 503", r.status_code == 503, f"{r.status_code}")

    # -------------------------------------------------- out-of-stock reservation
    cart_v = await another_variant_id(exclude=variant["id"])
    stock_before_abort = await variant_stock(cart_v)
    r = await c.post("/cart/items", headers=auth_h,
                     json={"product_variant_id": cart_v, "quantity": 2})
    check("add in-stock line ok", r.status_code == 200)
    orders_n = int(await db_scalar("SELECT count(*) FROM orders"))
    await db_exec("UPDATE product_variants SET stock = 0 WHERE id = $1", str(cart_v))  # sold out meanwhile
    r = await c.post("/checkout/start", headers=auth_h, json={"address_id": address_id})
    orders_after2 = int(await db_scalar("SELECT count(*) FROM orders"))
    await db_exec("UPDATE product_variants SET stock = $2 WHERE id = $1", str(cart_v), int(stock_before_abort))
    check("out-of-stock start -> 400, no order row, cart intact",
          r.status_code == 400 and r.json()["error"]["code"] == "OUT_OF_STOCK"
          and orders_after2 == orders_n, f"{r.status_code} {r.text[:100]}")
    r = await c.get("/cart", headers=auth_h)
    check("cart still holds the line after failed start", r.json()["totals"]["total_items"] == 2)
    r = await c.delete("/cart", headers=auth_h)
    check("cleanup cart", r.status_code == 200)

    await c.aclose()
    print("\n========== SUMMARY ==========")
    failed = [(n, d) for n, ok, d in results if not ok]
    print(f"{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("FAILED:")
        for n, d in failed:
            print(f"  - {n} ({d})")
        raise SystemExit(1)


async def variant_stock(variant_id: str) -> int:
    raw = await db_scalar("SELECT stock FROM product_variants WHERE id = $1", str(variant_id))
    return int(raw or 0)


async def a_variant_id() -> str:
    raw = await db_scalar(
        "SELECT id FROM product_variants WHERE stock > 0 AND is_active LIMIT 1"
    )
    return str(raw)


async def another_variant_id(exclude: str) -> str:
    raw = await db_scalar(
        "SELECT id FROM product_variants WHERE stock > 1 AND is_active AND id <> $1 LIMIT 1",
        exclude,
    )
    return str(raw)


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
