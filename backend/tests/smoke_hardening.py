"""Phase 6 e2e: hardening — security headers, rate limits (docs/04 §10),
media presign flow (docs/04 §8, local mock backend), and the expired
stock-reservation sweep.

Deliberately uses FIXED X-Forwarded-For identities for the limiter-burst
checks; every other HTTP client is hooked to a fresh random IP so ordinary
suite traffic never trips an over-limit 429.
"""

import asyncio
import random
from datetime import datetime, timedelta, timezone

import asyncpg
import httpx

BASE = "http://localhost:8000/api"
DSN = "postgresql://postgres:1234@localhost:5432/ecommerce"
SALT = random.randint(10**7, 10**9)
# fresh per-run identities so back-to-back runs never inherit a hot window
BURST_IP = f"203.0.{SALT % 255}.{(SALT >> 8) % 255}"
BURST_HEADERS = {"X-Forwarded-For": BURST_IP}

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


async def _xff_hook(request: httpx.Request) -> None:
    request.headers["X-Forwarded-For"] = f"198.51.{random.randint(0, 255)}.{random.randint(0, 255)}"


async def main() -> None:
    c = httpx.AsyncClient(
        base_url=BASE, timeout=30, event_hooks={"request": [_xff_hook]}
    )

    r = await c.post("/auth/login", json={"email": "admin@local.dev", "password": "Admin1234"})
    ADMIN = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = await c.post("/auth/signup", json={
        "email": f"hardening.smoke{SALT}@example.com", "password": "SmokePass123",
        "full_name": "Hardening Smoke",
    })
    CUSTOMER = {"Authorization": f"Bearer {r.json()['access_token']}"}
    customer_id = (await c.get("/auth/me", headers=CUSTOMER)).json()["id"]
    conn = await asyncpg.connect(DSN)
    await conn.execute("UPDATE users SET email_verified_at = now() WHERE email = $1",
                       f"hardening.smoke{SALT}@example.com")

    # ------------------------------------------------------- security headers
    r = await c.get("/products", params={"page_size": 1})
    check("security headers on responses",
          r.headers.get("x-content-type-options") == "nosniff"
          and r.headers.get("x-frame-options") == "DENY"
          and r.headers.get("referrer-policy") == "strict-origin-when-cross-origin",
          f"nosniff/frame/referrer ok")
    check("no HSTS in local env", "strict-transport-security" not in r.headers)

    # ------------------------------------------------------------ media flow
    png_bytes = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00"
                 b"\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89")
    jpg_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 16

    r = await c.post("/media/presign", headers={**ADMIN, "Content-Type": "application/json"},
                     json={"filename": "front.png", "content_type": "image/png"})
    check("media presign", r.status_code == 201
          and r.json()["key"].startswith("media-") and "/api/media/" in r.json()["public_url"],
          r.text[:120])
    png = r.json()

    r = await c.post("/media/presign", headers={**ADMIN, "Content-Type": "application/json"},
                     json={"filename": "x.gif", "content_type": "image/gif"})
    check("presign bad content type -> 422", r.status_code in (400, 422), f"{r.status_code}")

    # upload PNG bytes into the presigned key (admin-attached upload); the
    # presigned upload_url is absolute-start ("/api/...") so strip the prefix
    def _path(u: str) -> str:
        return u[len("/api"):] if u.startswith("/api") else u

    r = await c.put(_path(png["upload_url"]), headers=ADMIN, content=png_bytes)
    check("media upload PUT", r.status_code == 201 and r.json()["key"] == png["key"])
    r = await c.get("/media/localhack-should-404.png")
    check("media GET unknown -> 404", r.status_code in (404, 400), f"{r.status_code}")

    # wrong bytes for the declared (png) key -> validation error
    r = await c.post("/media/presign", headers={**ADMIN, "Content-Type": "application/json"},
                     json={"filename": "logo.jpg", "content_type": "image/jpeg"})
    jpg = r.json()
    r = await c.put(_path(jpg["upload_url"]), headers=ADMIN, content=b"not an image at all")
    check("upload garbage -> 400/422", r.status_code in (400, 422), f"{r.status_code}")
    r = await c.put(_path(jpg["upload_url"]), headers=ADMIN, content=jpg_bytes)
    check("upload real jpg ok", r.status_code == 201, r.text[:80])

    # serve publicly
    r = await c.get(_path(png["public_url"]))
    check("media public GET", r.status_code == 200
          and r.headers.get("content-type") == "image/png", f"{r.status_code}")

    # delete in use: attach both to a product first
    cats = (await c.get("/admin/categories", headers=ADMIN)).json()
    category_id = next(x["id"] for x in cats if x["is_active"] and x["name"] == "Accessories")
    r = await c.post("/admin/products", headers=ADMIN, json={
        "name": f"Hardening Media Product {SALT}",
        "description": "phase 6",
        "category_id": category_id,
        "images": [{"url": png["public_url"], "alt_text": "a"}, {"url": jpg["public_url"], "alt_text": "b"}],
        "variants": [{"name": "One", "price": 50000, "stock": 3}],
    })
    product_id = r.json()["id"]
    r = await c.delete(f"/media/{png['key']}", headers=ADMIN)
    check("delete used media -> 409 MEDIA_IN_USE", r.status_code == 409
          and r.json()["error"]["code"] == "MEDIA_IN_USE", f"{r.status_code}")

    # detach, then delete works; unknown -> 404
    r = await c.post(f"/admin/products/{product_id}/images", headers=ADMIN,
                     json={"images": []})
    check("clear gallery", r.status_code == 200)
    r = await c.delete(f"/media/{png['key']}", headers=ADMIN)
    check("delete unused media -> 204", r.status_code == 204, f"{r.status_code}")
    r = await c.delete(f"/media/{png['key']}", headers=ADMIN)
    check("delete again -> 404", r.status_code == 404, f"{r.status_code}")
    r = await c.post("/media/presign", headers=CUSTOMER,
                     json={"filename": "f.jpg", "content_type": "image/jpeg"})
    check("media presign non-admin -> 403", r.status_code == 403, f"{r.status_code}")

    # --------------------------------------------- expired-reservation sweep
    variant_id = None
    stock_before = None
    for item in (await c.get("/products", params={"page_size": 20, "in_stock": "true"})).json()["items"]:
        d = (await c.get(f"/products/{item['slug']}")).json()
        candidates = [v for v in d["variants"] if v["stock"] > 1]
        if candidates:
            variant_id = candidates[0]["id"]
            stock_before = candidates[0]["stock"]
            break
    assert variant_id is not None
    r = await c.post("/cart/items", headers=CUSTOMER,
                     json={"product_variant_id": variant_id, "quantity": 1})
    r = await c.post("/users/addresses", headers=CUSTOMER, json={
        "line1": "9 Sweep Ln", "city": "Pune", "state": "MH",
        "postal_code": "411001", "country": "IN", "phone": "+919000000002",
    })
    addr = (await c.get("/users/addresses", headers=CUSTOMER)).json()[0]
    r = await c.post("/checkout/start", headers=CUSTOMER, json={"address_id": addr["id"]})
    order = r.json()["order"]
    check("pending order created", order["status"] == "PENDING", r.text[:100])
    db_stock_mid = int(await conn.fetchval(
        "SELECT stock FROM product_variants WHERE id = $1", variant_id
    ))
    check("stock reserved at start", db_stock_mid == stock_before - 1,
          f"{db_stock_mid} vs {stock_before - 1}")

    # backdate the reservation so the sweeper finds it
    await conn.execute(
        "UPDATE orders SET reserved_until = now() - interval '1 min' WHERE id = $1",
        order["id"],
    )
    r = await c.post("/admin/maintenance/reservations/sweep", headers=ADMIN)
    check("admin sweep endpoint", r.status_code == 200 and r.json()["swept"] >= 1, r.text[:80])
    db_stock_after = int(await conn.fetchval(
        "SELECT stock FROM product_variants WHERE id = $1", variant_id
    ))
    check("sweeper restored stock", db_stock_after == stock_before,
          f"{db_stock_after} vs {stock_before}")
    r = await c.get("/orders", headers=CUSTOMER)
    swept = next(o for o in r.json()["items"] if o["order_number"] == order["order_number"])
    check("order cancelled by sweeper", swept["status"] == "CANCELLED", swept["status"])
    r = await c.post("/admin/maintenance/reservations/sweep", headers=ADMIN)
    check("sweep idempotent (nothing left)", r.status_code == 200, r.text[:80])

    r = await c.post("/admin/maintenance/reservations/sweep", headers=CUSTOMER)
    check("sweep non-admin -> 403", r.status_code == 403, f"{r.status_code}")

    # keep the catalog baseline: retire the media product (soft delete)
    r = await c.delete(f"/admin/products/{product_id}", headers=ADMIN)
    check("cleanup media product", r.status_code == 204, f"{r.status_code}")

    # ------------------------------------------------------- rate limits §10
    r = await c.get("/webhooks/noop", headers=BURST_HEADERS)
    check("webhook exempt from limiter", r.status_code in (404, 405), f"{r.status_code}")

    burst = httpx.AsyncClient(base_url=BASE, timeout=15, headers=BURST_HEADERS)
    codes = []
    for i in range(6):
        rr = await burst.post("/auth/signup", json={
            "email": f"burst{i}.{SALT}@example.com", "password": "BurstPass1",
            "full_name": "Burst",
        })
        codes.append(rr.status_code)
        if rr.status_code == 429:
            check("429 RATE_LIMITED + Retry-After",
                  rr.headers.get("retry-after") is not None
                  and rr.json()["error"]["code"] == "RATE_LIMITED"
                  and int(rr.headers["retry-after"]) > 0,
                  f"codes={codes} retry_after={rr.headers.get('retry-after')}")
            break
    else:
        check("429 RATE_LIMITED after 5 auth burst", False, f"codes={codes}")
    rr = await burst.post("/auth/login", json={"email": "a@b.c", "password": "x"})
    check("auth window still blocked", rr.status_code == 429, f"{rr.status_code}")
    # same IP, different family → catalog NOT blocked by the auth burst
    rr = await burst.get("/products", params={"page_size": 1})
    check("families isolate (catalog open on same IP)", rr.status_code == 200,
          f"{rr.status_code}")
    # catalog burst: 121 requests on a dedicated IP
    catalog_client = httpx.AsyncClient(
        base_url=BASE, timeout=15,
        headers={"X-Forwarded-For": f"203.1.{SALT % 255}.{(SALT >> 10) % 255}"},
    )
    over = None
    for i in range(126):
        rr = await catalog_client.get("/products", params={"page_size": 1})
        if rr.status_code == 429:
            over = i + 1
            break
    check("catalog bursts at 120/min -> 429", over == 121 and over is not None,
          f"429 at request {over}")

    await conn.close()
    await c.aclose()
    await burst.aclose()
    await catalog_client.aclose()
    print("\n========== SUMMARY ==========")
    failed = [(n, d) for n, ok, d in results if not ok]
    print(f"{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        for n, d in failed:
            print(f"  - {n} ({d})")
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
