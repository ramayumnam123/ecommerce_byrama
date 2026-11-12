# E-Commerce Platform

Full-stack, production-ready e-commerce: storefront + admin panel + analytics
dashboard. Next.js 15 frontend · FastAPI backend · PostgreSQL · Razorpay.

**Architecture:** see [`ARCHITECTURE.md`](ARCHITECTURE.md) and the detailed
documents in [`docs/`](docs/).

## Quickstart (local dev)

```powershell
# one-time (env files, python venv, deps, migrations)
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1

# 1) infra (Postgres + Redis) — or point DATABASE_URL/REDIS_URL at local installs
docker compose up -d

# 2) migrate + run the API
cd backend
..\.venv\Scripts\alembic upgrade head
..\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
# → Swagger: http://localhost:8000/docs

# equivalent shorthand (works from `backend/` or `backend/app/`):
#   ..\.venv\Scripts\python -m app.main
#   ..\.venv\Scripts\python app\main.py
# host/port/reload come from HOST / PORT / RELOAD env vars
# (defaults: 127.0.0.1, 8000, and reload on when ENVIRONMENT=local)

# 3) run the frontend (once scaffolded)
cd ../frontend
npm run dev     # → http://localhost:3000
```

No Docker? Install PostgreSQL 18 locally and set `DATABASE_URL` in
`backend/.env`. Redis is *optional* in this deployment: the rate limiter runs
in-process and the ARQ jobs (expired-reservation sweep, email queue) run as
in-process asyncio tasks — both have documented Redis/ARQ swap points when you
scale out. Razorpay, Resend email, and S3/R2 media all work in **mock mode**
until their keys are set in `.env`.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 — Foundation | scaffold, config, models, migrations, JWT auth, health | ✅ done — 22/22 e2e auth checks green |
| 2 — Catalog & Cart | products, categories, cart, storefront pages | ✅ backend done — 34/34 e2e catalog+cart checks green (storefront pages: frontend mega-step) |
| 3 — Checkout & Payments | Razorpay, webhooks, orders, emails | ✅ done — 30/30 e2e checkout checks (mock-pay mode; real keys wire into the same flow) |
| 4 — Admin Panel | catalog/coupon/order/user CRUD, refunds, audit log | ✅ done — 52/52 e2e admin checks green (state machine + gateway refunds, never-sold variant rule, audit feed; frontend admin UI: frontend mega-step) |
| 5 — Analytics | summary, revenue-by-day, top products, category split, customer growth, low stock | ✅ done — 20/20 e2e analytics checks green (doc-SQL reconciliation against demo orders; materialized rollup + ARQ refresh is the >100k-monthly-orders scale-out) |
| 6 — Hardening | rate limits, security headers, media uploads, reservation sweeper, emails | ✅ done — 27/27 e2e hardening checks green (docs/04 §10 limiter with 429+Retry-After, security headers, presigned media with local mock backend, expired-reservation sweep + admin hook; CI/CD + production deploy: see `docs/09`) |

**Test totals: 185/185 e2e checks across 6 suites** (`backend/tests/smoke_*.py`),
all runnable against `python -m uvicorn app.main:app --port 8000` + seeded DB
(`python -m scripts.seed --with-demo-orders`).
