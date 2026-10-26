# 02 — Backend Architecture (FastAPI)

## 1. Design

- **Layered, modular monolith.** Service layer holds business logic; routers
  are thin I/O shells; models never leak into schemas. Modules are split so a
  future service extraction is mechanical.
- **Async from top to bottom** — asyncpg pool, no blocking calls in handlers.
- **Explicit dependency injection** via FastAPI `Depends` for db session,
  current user, RBAC, pagination, rate limiter.

## 2. Directory (file-by-file)

```
backend/
├── alembic/                        # migrations env + versions/
├── app/
│   ├── main.py                     # create_app(): FastAPI, lifespan wiring
│   ├── core/
│   │   ├── config.py               # pydantic Settings: env-aware, fail-fast on prod
│   │   ├── security.py             # argon2 hash/verify, JWT create/decode
│   │   ├── deps.py                 # get_db, get_current_user, require_roles,
│   │   │                           #   get_pagination, settings singleton
│   │   ├── exceptions.py           # AppError hierarchy + handler → error envelope
│   │   ├── logging.py              # structlog JSON config, request-id binding
│   │   ├── rate_limit.py           # Redis token bucket (slowapi-compatible)
│   │   └── pagination.py           # page/page_size + Link + X-Total-Count
│   ├── db/
│   │   ├── base.py                 # DeclarativeBase, naming convention, tz-aware ts
│   │   ├── session.py              # async engine + sessionmaker
│   │   └── mixins.py               # TimestampMixin, SoftDeleteMixin (products only)
│   ├── models/                     # SQLAlchemy 2.0 Mapped[] models
│   │   ├── user.py, address.py, refresh_token.py
│   │   ├── category.py, product.py, product_image.py, product_variant.py
│   │   ├── cart.py, coupon.py, order.py, payment.py
│   │   ├── review.py, audit_log.py, setting.py
│   │   └── __init__.py             # re-export all (Alembic autogenerate target)
│   ├── schemas/                    # Pydantic v2 (request/response, camelCase off: snake)
│   │   ├── auth_schemas.py, user_schemas.py
│   │   ├── catalog_schemas.py      # category, product, variant, image
│   │   ├── cart_schemas.py, checkout_schemas.py, order_schemas.py
│   │   ├── coupon_schemas.py, admin_schemas.py, analytics_schemas.py
│   │   └── common.py               # Page[T], Money, ErrorBody
│   ├── services/                   # business logic (pure-ish, unit-testable)
│   │   ├── auth_service.py         # signup, login, refresh w/ rotation, reset flows
│   │   ├── user_service.py
│   │   ├── catalog_service.py     # catalog CRUD + cache invalidation hooks
│   │   ├── cart_service.py        # guest/user carts, merge, atomic quantity ops
│   │   ├── checkout_service.py    # validate cart → reserve stock → rzp order
│   │   ├── order_service.py       # status machine, my-orders, tracking update
│   │   ├── payment_service.py     # webhook verify + idempotent state transitions
│   │   ├── inventory_service.py   # reserve/release/decrement, low-stock checks
│   │   ├── coupon_service.py     # validate/apply/rollback usage counts
│   │   ├── media_service.py       # presigned upload/download, image validation
│   │   ├── email_service.py       # Resend client + Jinja2 templates
│   │   ├── audit_service.py       # record admin actions
│   │   └── analytics_service.py   # SQL aggregations (see doc 08)
│   ├── routers/
│   │   ├── auth.py, users.py, catalog.py, cart.py, checkout.py
│   │   ├── orders.py, coupons.py, webhooks.py, media.py
│   │   ├── admin/products.py, admin/orders.py, admin/coupons.py
│   │   ├── admin/users.py, admin/analytics.py, admin/audit.py
│   │   └── health.py               # /healthz (liveness), /readyz (db+redis)
│   ├── workers/
│   │   ├── arq_settings.py         # worker settings, queue names
│   │   └── jobs/                   # send_email, release_expired_reservations,
│   │                               #   send_order_confirmation, sync_reconcile
│   └── utils/
│       ├── masking.py              # mask email/phone in logs
│       ├── idempotency.py          # header-keyed operation locks (Redis SETNX)
│       └── slugify.py
├── tests/                          # (see doc 10)
│   ├── conftest.py                 # async engine, transaction-rollback fixtures
│   ├── unit/, integration/, e2e/
├── alembic.ini
├── Dockerfile                      # multi-stage, uvicorn + arq targets
├── pyproject.toml                  # deps, ruff, mypy strict config
└── .env.example
```

## 3. Request Pipeline (order matters)

1. **LoggingMiddleware** — bind `request_id` (ULID), response time, user id if present
2. **CORS** — allow only `FRONTEND_ORIGIN` (+ `localhost` in dev)
3. **GZipMiddleware** — JSON compression
4. **TrustedHostMiddleware** — prod: only API domain
5. **Rate limiter** (per-route dependency, Redis): global 120/min/IP;
   auth 5/min/IP; checkout 10/min/user; webhooks exempt (signature = auth)
6. Router → Pydantic validation → service → SQLAlchemy async → response
7. **Exception handlers** — `AppError` subclass → typed envelope; unknown →
   logged `error`, generic 500 body (no internals leaked)

## 4. Error Contract (canonical)

```json
{
  "error": {
    "code": "INVALID_COUPON",            // stable, machine-readable
    "message": "Coupon expired",         // user-presentable
    "details": {"field": "code"},
    "request_id": "01J..."               // for support/tracing
  }
}
```

| Status | Codes thrown |
|---|---|
| 400 | VALIDATION, INVALID_COUPON, CART_EMPTY, OUT_OF_STOCK, BAD_REQUEST |
| 401 | AUTH_REQUIRED, TOKEN_EXPIRED, REFRESH_INVALID |
| 403 | FORBIDDEN, EMAIL_NOT_VERIFIED |
| 404 | NOT_FOUND |
| 409 | EMAIL_TAKEN, WEAK_PASSWORD, IDEMPOTENCY_CONFLICT |
| 422 | SCHEMA (Pydantic default) |
| 429 | RATE_LIMITED |
| 500 | INTERNAL |

## 5. Configuration (`app/core/config.py`)

pydantic `BaseSettings`, env prefix none, loaded from `.env`; **fails fast** if
`ENVIRONMENT=production` with debug or default-secret configs. Variables listed
in [09 Infrastructure](09-infrastructure-deployment.md#env-vars). DSN parsing:
`DATABASE_URL` → async driver swap automatically (`postgresql://` →
`postgresql+asyncpg://`).

## 6. Background Jobs (ARQ, Redis-backed)

| Job | Trigger | Does |
|---|---|---|
| `send_email` | auth/checkout services | Resend send w/ retry (exp backoff ×3) |
| `order_confirmation` | payment.captured | receipt email + PDF link |
| `release_expired_reservations` | cron every 5 min | cancel PENDING orders past TTL, restore stock, notify |
| `reconcile_razorpay` | cron every 15 min | fetch gateway-payment status for PENDING orders older than 30 min, settle/refund |
| `recompute_analytics_cache` | cron hourly | refresh materialized daily-rollup rows |

Worker process is separate from web (Docker target `worker`), scales
independently, crash-safe (Redis persistence).

## 7. Caching Strategy

| Data | Where | TTL / invalidation |
|---|---|---|
| Public product detail JSON | Redis (`prod:{id}`) | 5 min or purge on admin mutation |
| Category tree | Redis | purge on mutation |
| Analytics rollups | Postgres materialized + Redis | hourly job + on demand |
| Auth: nothing cached | — | always DB (revocation correctness) |
| Next.js page cache | Vercel ISR | tags `product/{id}`, `category/{slug}` |

Rule: **cache reads ok, never cache writes**; single `cache` service module so
policies stay in one place.

## 8. Concurrency & Transaction Rules

- One transaction per request via `get_db` (commit on success, rollback on error).
- **Stock ops** always inside the checkout/order transaction with
  `SELECT … FOR UPDATE`; never blind increments on application side.
- **Idempotency**: `Idempotency-Key` header (checkout) → Redis `SET NX EX 15m`;
  conflict → 409 with original outcome reference.
- Long email/network work → ARQ job, never in-the-loop.
