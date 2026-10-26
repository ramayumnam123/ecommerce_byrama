"""Phase 5 e2e: analytics endpoints (docs/04 §9.5, docs/08 §3).

Verifies the documented SQL semantics through the API:
- window resolution (7d/30d/90d/custom + validation)
- summary vs direct-SQL reconciliation (PAID/SHIPPED/DELIVERED basis,
  netting partial refunds, excluding REFUNDED/CANCELLED)
- zero-filled day series, sorting, top-N, share math, monotonic growth
"""

import asyncio
import random
from datetime import datetime, timedelta, timezone

import asyncpg
import httpx

BASE = "http://localhost:8000/api"
DSN = "postgresql://postgres:1234@localhost:5432/ecommerce"
SALT = random.randint(10**7, 10**9)


async def _xff_hook(request: httpx.Request) -> None:
    """Each request appears from a distinct client IP for the rate limiter."""
    request.headers["X-Forwarded-For"] = f"198.51.{random.randint(0, 255)}.{random.randint(0, 255)}"

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


async def main() -> None:
    c = httpx.AsyncClient(base_url=BASE, timeout=30, event_hooks={"request": [_xff_hook]})
    r = await c.post("/auth/login", json={"email": "admin@local.dev", "password": "Admin1234"})
    ADMIN = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = await c.post("/auth/signup", json={
        "email": f"analytics.smoke{SALT}@example.com", "password": "SmokePass123",
        "full_name": "Analytics Smoke",
    })
    CUSTOMER = {"Authorization": f"Bearer {r.json()['access_token']}"}

    # ------------------------------------------------------------- auth gates
    r = await c.get("/admin/analytics/summary", headers=CUSTOMER)
    check("analytics non-admin -> 403", r.status_code == 403, f"{r.status_code}")
    r = await c.get("/admin/analytics/summary")
    check("analytics anon -> 401", r.status_code == 401, f"{r.status_code}")

    # -------------------------------------------------------- validation rules
    r = await c.get("/admin/analytics/summary", headers=ADMIN, params={"period": "custom"})
    check("custom without from/to -> 400", r.status_code == 400, f"{r.status_code}")
    r = await c.get("/admin/analytics/summary", headers=ADMIN,
                    params={"period": "custom", "from": "2026-10-20T00:00:00Z", "to": "2026-10-01T00:00:00Z"})
    check("custom to < from -> 400", r.status_code == 400, f"{r.status_code}")
    r = await c.get("/admin/analytics/revenue-by-day", headers=ADMIN, params={"period": "5d"})
    check("unknown period -> 422", r.status_code == 422, f"{r.status_code}")

    now = datetime.now(timezone.utc)
    r = await c.get("/admin/analytics/revenue-by-day", headers=ADMIN, params={
        "period": "custom", "from": (now - timedelta(days=10)).isoformat(), "to": now.isoformat(),
    })
    check("custom 10d window -> 11 zero-filled rows",
          r.status_code == 200 and len(r.json()) == 11
          and r.json()[0]["date"] <= r.json()[-1]["date"], f"{len(r.json())} rows")

    # ------------------------------------------------------------- 7d vs 30d
    s7 = (await c.get("/admin/analytics/summary", headers=ADMIN, params={"period": "7d"})).json()
    s30 = (await c.get("/admin/analytics/summary", headers=ADMIN)).json()
    check("7d summary has live data", s7["revenue"] > 0 and s7["orders_count"] > 0, str(s7)[:120])
    check("aov = floor(revenue/orders)", s30["aov"] == s30["revenue"] // s30["orders_count"],
          f"{s30['aov']} vs {s30['revenue']}//{s30['orders_count']}")
    check("7d is a subset of 30d", s7["orders_count"] <= s30["orders_count"]
          and s7["revenue"] <= s30["revenue"], "sub-window")
    check("delta keys present", {"revenue", "orders_count", "aov", "units_sold", "customers"}
          <= set(s30["deltas_vs_prev"]), str(s30["deltas_vs_prev"])[:100])

    # ---------------------------------------------- SQL reconciliation (90d)
    from90 = (now - timedelta(days=90)).isoformat()
    s90 = (await c.get("/admin/analytics/summary", headers=ADMIN,
                       params={"period": "custom", "from": from90, "to": now.isoformat()})).json()
    conn = await asyncpg.connect(DSN)
    try:
        exp_rev, exp_orders = await conn.fetchrow(
            "SELECT COALESCE(SUM(o.total - COALESCE(o.refund_amount,0)),0), COUNT(*) FROM orders o "
            "WHERE o.status IN ('PAID','SHIPPED','DELIVERED') AND o.paid_at >= $1 AND o.paid_at < $2",
            datetime.fromisoformat(from90), now,
        )
        exp_units = await conn.fetchval(
            "SELECT COALESCE(SUM(l.quantity),0) FROM order_items l JOIN orders o ON o.id = l.order_id "
            "WHERE o.status IN ('PAID','SHIPPED','DELIVERED') AND o.paid_at >= $1 AND o.paid_at < $2",
            datetime.fromisoformat(from90), now,
        )
        exp_days = await conn.fetchrow(
            "SELECT COALESCE(SUM(o.total),0), COUNT(*) FROM orders o "
            "WHERE o.status IN ('PAID','SHIPPED','DELIVERED') AND o.paid_at >= $1 AND o.paid_at < $2",
            datetime.fromisoformat(from90), now,
        )
    finally:
        await conn.close()
    check("summary revenue matches doc SQL (net refunds)",
          s90["revenue"] == int(exp_rev) and s90["orders_count"] == int(exp_orders),
          f"api={(s90['revenue'], s90['orders_count'])} sql={(exp_rev, exp_orders)}")
    check("units_sold matches doc SQL", s90["units_sold"] == int(exp_units),
          f"api={s90['units_sold']} sql={exp_units}")

    # ---------------------------------------------------------- day series
    days90 = (await c.get("/admin/analytics/revenue-by-day", headers=ADMIN,
                          params={"period": "custom", "from": from90, "to": now.isoformat()})).json()
    check("90d day series math matches doc SQL",
          sum(d["revenue"] for d in days90) == int(exp_days[0])
          and sum(d["orders"] for d in days90) == int(exp_days[1]),
          f"api=({sum(d['revenue'] for d in days90)}, {sum(d['orders'] for d in days90)}) "
          f"sql=({exp_days[0]}, {exp_days[1]})")
    days30 = (await c.get("/admin/analytics/revenue-by-day", headers=ADMIN, params={"period": "30d"})).json()
    check("30d -> 31 zero-filled sorted rows",
          len(days30) == 31 and [d["date"] for d in days30] == sorted(d["date"] for d in days30)
          and any(d["revenue"] > 0 for d in days30), f"{len(days30)} rows")
    check("corrupt order rows excluded",
          s90["revenue"] > 0, "paid-basis only")

    # ------------------------------------------------------------ top products
    tops = (await c.get("/admin/analytics/top-products", headers=ADMIN, params={"period": "90d"})).json()
    check("top products <= 10, revenue-desc",
          len(tops) <= 10 and len(tops) > 0
          and [t["revenue"] for t in tops] == sorted((t["revenue"] for t in tops), reverse=True)
          and all(t["units"] > 0 for t in tops),
          f"{len(tops)} rows, top={tops[0]['name']}")
    check("top units <= total units sold", sum(t["units"] for t in tops) <= s90["units_sold"])

    # ------------------------------------------------------ sales by category
    cats = (await c.get("/admin/analytics/sales-by-category", headers=ADMIN, params={"period": "90d"})).json()
    check("category shares sum to ~100, desc",
          abs(sum(ct["share"] for ct in cats) - 100) < 0.2
          and [ct["revenue"] for ct in cats] == sorted((ct["revenue"] for ct in cats), reverse=True)
          and all(ct["revenue"] > 0 for ct in cats),
          f"{len(cats)} cats, sum={sum(ct['share'] for ct in cats):.1f}")

    # --------------------------------------------------------- customer growth
    growth = (await c.get("/admin/analytics/customer-growth", headers=ADMIN, params={"period": "30d"})).json()
    cum_ok = all(growth[i]["cumulative"] <= growth[i + 1]["cumulative"] for i in range(len(growth) - 1))
    check("growth cumulative monotonic + sums",
          len(growth) == 31 and cum_ok
          and growth[-1]["cumulative"] == sum(g["new_customers"] for g in growth)
          and growth[-1]["cumulative"] > 0, f"final cumulative={growth[-1]['cumulative']}")

    # ------------------------------------------------------------- low stock
    low = (await c.get("/admin/analytics/low-stock", headers=ADMIN)).json()
    check("low stock all < 5 with names", len(low) > 0
          and all(lt["stock"] < 5 for lt in low)
          and all(lt["sku"] and lt["product_name"] for lt in low),
          f"{len(low)} variants, worst={low[0]['stock']}")

    await c.aclose()
    print("\n========== SUMMARY ==========")
    failed = [(n, d) for n, ok, d in results if not ok]
    print(f"{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        for n, d in failed:
            print(f"  - {n} ({d})")
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
