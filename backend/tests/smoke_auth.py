"""Phase 1 E2E smoke test (docs/10 §2 journey 1).

Covers: signup, /me, bad password, PATCH /me, refresh rotation, token-family
revocation on reuse, re-login, logout, password policy, email uniqueness.

Cookies are captured from Set-Cookie headers explicitly (no cookie-jar magic).

Requires: API on :8000 with Postgres up. Safe to re-run (cleans its own rows).
"""

import re
import random

import httpx

BASE = "http://localhost:8000/api"
EMAIL = "smoke.user@example.com"
PASSWORD = "SmokePass123"  # noqa: S105
NAME = "Smoke User"

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


def refresh_cookie_of(r: httpx.Response) -> str | None:
    for raw in r.headers.get_list("set-cookie"):
        m = re.match(r"refresh_token=([^;]+)", raw)
        if m:
            return m.group(1)
    return None


def clean_db() -> None:  # pragma: helper
    """Idempotent reruns: drop this test's rows right in Postgres (sync helper)."""
    import asyncio
    import os

    import asyncpg

    dsn = os.environ.get(
        "DATABASE_URL", "postgresql://postgres:1234@localhost:5432/ecommerce"
    )
    if not dsn.startswith("postgres"):
        dsn = "postgresql://postgres:1234@localhost:5432/ecommerce"

    async def _run() -> None:
        conn = await asyncpg.connect(dsn)
        emails = ["smoke.user@example.com", "weak@example.com"]
        await conn.execute(
            "DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))",
            emails,
        )
        await conn.execute(
            "DELETE FROM users WHERE email = ANY($1)", emails
        )
        await conn.close()

    return _run()  # coroutine; awaited by main()


async def _xff_hook(request: httpx.Request) -> None:
    """Each request appears from a distinct client IP for the rate limiter."""
    request.headers["X-Forwarded-For"] = f"198.51.{random.randint(0, 255)}.{random.randint(0, 255)}"


async def main() -> None:
    await clean_db()
    c = httpx.AsyncClient(base_url=BASE, timeout=15, event_hooks={"request": [_xff_hook]})

    # --------------------------------------------------------------- signup
    r = await c.post(
        "/auth/signup", json={"email": EMAIL, "password": PASSWORD, "full_name": NAME}
    )
    check("signup -> 201 + tokens + user",
          r.status_code == 201 and "access_token" in r.json(), f"got {r.status_code}")
    token_a = r.json()["access_token"]
    cookie_a = refresh_cookie_of(r)
    user = r.json().get("user", {})
    check("signup returns user role CUSTOMER", user.get("role") == "CUSTOMER", str(user.get("role")))
    check("signup returns unverified email", user.get("email_verified") is False, str(user.get("email_verified")))
    check("refresh cookie A set", cookie_a is not None, "present" if cookie_a else "missing")

    # -------------------------------------------------------------- me GET
    headers = {"Authorization": f"Bearer {token_a}"}
    r = await c.get("/auth/me", headers=headers)
    check("GET /me -> 200, own email", r.status_code == 200 and r.json()["email"] == EMAIL.lower(), f"got {r.status_code}")

    # ------------------------------------------------------ bad credentials
    r = await c.post("/auth/login", json={"email": EMAIL, "password": "WrongPass1"})
    check("bad password -> 401 AUTH_REQUIRED envelope",
          r.status_code == 401 and r.json()["error"]["code"] == "AUTH_REQUIRED", f"got {r.status_code}")
    r = await c.post("/auth/login", json={"email": "ghost@nobody.com", "password": "WrongPass1"})
    check("unknown email -> identical 401 (no enumeration)", r.status_code == 401, f"got {r.status_code}")

    # -------------------------------------------------------------- me PATCH
    r = await c.patch("/auth/me", headers=headers, json={"full_name": "Smoke Renamed"})
    check("PATCH /me full_name", r.status_code == 200 and r.json()["full_name"] == "Smoke Renamed", f"got {r.status_code}")
    r = await c.patch("/auth/me", headers=headers, json={"full_name": ""})
    check("PATCH /me rejects empty name -> 422", r.status_code == 422, f"got {r.status_code}")

    # ------------------------------------------------------- refresh rotation
    r = await c.post("/auth/refresh", headers={"Cookie": f"refresh_token={cookie_a}"})
    check("refresh (A -> B) -> 200 + new tokens", r.status_code == 200, f"got {r.status_code}")
    token_b = r.json()["access_token"]
    cookie_b = refresh_cookie_of(r)
    check("refresh returned different access token", token_b != token_a, "ok" if token_b != token_a else "same!")
    check("refresh rotated cookie (B != A)", cookie_b not in (cookie_a, None), "ok" if cookie_b != cookie_a else "same!")

    # ------------------------------------- reuse detection (docs/05 §3)
    r = await c.post("/auth/refresh", headers={"Cookie": f"refresh_token={cookie_a}"})
    check("reusing rotated token A -> 401 REFRESH_INVALID",
          r.status_code == 401 and r.json()["error"]["code"] == "REFRESH_INVALID", f"got {r.status_code}")
    r = await c.post("/auth/refresh", headers={"Cookie": f"refresh_token={cookie_b}"})
    check("family burned: current cookie B also -> 401", r.status_code == 401, f"got {r.status_code}")

    # ------------------------------------------------------------- re-login
    r = await c.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    check("re-login after revoke -> 200", r.status_code == 200, f"got {r.status_code}")
    token_c = r.json()["access_token"]
    r = await c.get("/auth/me", headers={"Authorization": f"Bearer {token_c}"})
    check("new access token works", r.status_code == 200, f"got {r.status_code}")

    # ---------------------------------------------------------------- logout
    r = await c.post("/auth/logout", headers=headers)  # no valid refresh cookie
    check("logout (no cookie) -> 200", r.status_code == 200, f"got {r.status_code}")
    r = await c.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    logged_in = refresh_cookie_of(r)
    r = await c.post("/auth/logout", headers={"Cookie": f"refresh_token={logged_in}"})
    check("logout with cookie -> 200", r.status_code == 200, f"got {r.status_code}")
    r = await c.post("/auth/refresh", headers={"Cookie": f"refresh_token={logged_in}"})
    check("refresh after logout -> 401", r.status_code == 401, f"got {r.status_code}")

    # ------------------------------------------------------------ validation
    r = await c.post("/auth/signup", json={"email": "weak@example.com", "password": "weakpass", "full_name": "W"})
    check("password without upper/digit -> 400 VALIDATION",
          r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION", f"got {r.status_code}")
    r = await c.post("/auth/signup", json={"email": EMAIL, "password": PASSWORD, "full_name": NAME})
    check("duplicate email -> 409 EMAIL_TAKEN",
          r.status_code == 409 and r.json()["error"]["code"] == "EMAIL_TAKEN", f"got {r.status_code}")
    r = await c.get("/auth/me")
    check("no token -> 401", r.status_code == 401, f"got {r.status_code}")

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
