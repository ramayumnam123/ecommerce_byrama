# 01 — System Overview

## 1. Goals

| Goal | How it is achieved |
|---|---|
| Full-stack commerce app | Storefront + checkout + account on Next.js; APIs on FastAPI |
| Admin panel | `/admin` SPA-style section, RBAC-protected, full CRUD |
| Analytics dashboard | `/admin/analytics` — KPIs + charts from SQL aggregations |
| Auth | Email+password with verification, JWT access/refresh, roles |
| Scalable | Stateless API, horizontal scaling, cache-friendly read paths |
| Production ready | Observability, CI/CD, migrations, rate limits, tested, launched |

## 2. Non-Goals (v1)

- Multi-vendor / marketplace — new tenant concepts later would be a refactor
- Multi-language storefront (i18n-ready strings, but single locale v1)
- Subscriptions / recurring billing (Razorpay Subscriptions can be added later)
- Native mobile apps (PWA covers mobile; API is already clean for a future app)

## 3. Core Principles

1. **One source of truth: PostgreSQL.** Catalog, orders, payments, users.
   Redis is cache/ephemeral only — losing it must lose no data.
2. **Server-side authorization everywhere.** Every `/api/admin/*` endpoint
   validates the JWT and role. Frontend guards are UX only.
3. **Orders are immutable snapshots.** Order rows freeze product names, prices,
   and the shipping address at purchase time. Catalog changes never corrupt
   history.
4. **Money semantics:** store all amounts as integers in minor units
   (`int`, paise). Currency from settings (default `INR`). Floats never touch money.
5. **Idempotency at the payment boundary.** Webhooks may arrive twice and out
   of order; all handlers are idempotent.
6. **Stateless compute.** Any request can hit any replica; all shared state
   lives in Postgres/Redis. Enables horizontal scale behind a load balancer.
7. **Ship in increments.** Six phases; system runs after each one.

## 4. High-Level Architecture

```
                       ┌───────────────────────────┐
                       │ Browser (Customer/Admin)  │
                       └──────────────┬────────────┘
                                      │ HTTPS
                    ┌─────────────────┼──────────────────┐
                    ▼                                     ▼
        ┌───────────────────────┐             ┌────────────────────────┐
        │ Vercel CDN + Next.js  │   REST/JSON │ Railway/Render: FastAPI│
        │ (SSR / ISR / SPA)     ├────────────▶│ (uvicorn, 2+ replicas) │
        └──────────┬────────────┘             └───────┬────────┬───────┘
                   │ <Image> presigned URLs           │        │
                   ▼                                  ▼        ▼
        ┌───────────────────────┐          ┌────────────┐ ┌────────────┐
        │ R2/S3 (product media) │          │ PostgreSQL │ │ Redis 7    │
        └───────────────────────┘          │ (Neon)     │ │ (Upstash)  │
                                           └────────────┘ └─────┬──────┘
                                                                │ ARQ queue
                                                                ▼
                                                        background workers
                                                                │
                    ┌────────────────────────┐                  │
                    │ Razorpay ⟵ webhooks ---┼──────────────────┘
                    └────────────────────────┘
                    ├ Resend (transactional email)
```

## 5. Key Request Flows

### 5.1 Guest browsing (read-heavy, cache-friendly)

```
Browser → Next.js ISR product page (CDN cache hit, no origin call) → done.
Browser → /api/products?filters (client-side query) → Next API proxy OR
          direct fetch to FastAPI → Postgres (indexed) → JSON.
```
- Catalog endpoints are public, GET-only, cache-hittable.
- Cart/checkout/auth are dynamic and never cached.

### 5.2 Sign up / sign in

Detailed in [05 Auth & Security](05-auth-security.md). Summary:
signup → argon2 verify → access JWT (15 min) + refresh cookie (7 d) →
Next.js middleware verifies the access token with the **shared HS256 secret**
(no backend round-trip per navigation).

### 5.3 Purchase (write path, strongest invariants)

```
1. POST /api/orders/checkout        # validate cart, reserve stock, PV lock
2. → Razorpay Orders API            # create gateway order
3. Razorpay Checkout.js modal       # customer pays
4. POST /api/webhooks/razorpay      # payment.captured → PAID + permanent
                                    # stock decrement + email + receipt (ARQ job)
5. Customer confirmation email + order status page
```
Full contract: [06 Payments](06-payments-razorpay.md).

### 5.4 Admin writes to catalog

Admin edits product → FastAPI mutates Postgres → ISR cache invalidation via
webhook-style `POST /api/revalidate` (internal secret) so product pages purge.

## 6. Consistency Model

| Concern | Mechanism |
|---|---|
| Stock overselling | `SELECT … FOR UPDATE` row lock on variant row inside checkout transaction |
| Abandoned checkout stock leak | Reservation TTL: ARQ job releases stock of PENDING orders > 15 min |
| Duplicate webhook | Idempotency: check `payments.status` before mutating; unique provider ids |
| Double-click "Place order" | Client disables button + server dedupes on idempotency key |
| Stale product pages | Tag-based revalidation (`product/{id}`) on catalog mutations |
| Cart race (two tabs) | Cart ops are atomic SQL (`ON CONFLICT` upsert for quantities) |

## 7. Deployment Topology (production)

| Component | Where | Scaling |
|---|---|---|
| Next.js | Vercel (or self-hosted Docker) | edge/CDN, autoscale |
| FastAPI | Railway/Render/Fly (Docker) | 1 → N uvicorn replicas (CPU-based) |
| ARQ workers | Same host, separate process | scale independently of web |
| PostgreSQL | Neon/Supabase | vertical + read replica later |
| Redis | Upstash/Railway | managed, can cluster |
| Object storage | Cloudflare R2/S3 | effectively infinite |
| Webhooks ready | Razorpay dashboard → `https://api.domain.com/api/webhooks/razorpay` |

Full details: [09 Infrastructure](09-infrastructure-deployment.md).

## 8. Environments

| Env | Purpose | Data | Payment mode |
|---|---|---|---|
| `local` | docker-compose on dev machine | seed data | Razorpay test keys |
| `staging` | `staging.` subdomain | seed/scrubbed | test |
| `prod` | `domain.com` | real | live |

Staging is optional but recommended once Vercel + Railway are wired.
