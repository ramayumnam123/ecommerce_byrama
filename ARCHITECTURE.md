# E-Commerce Platform — Master Architecture

Production-grade, full-stack e-commerce platform: customer storefront, admin
panel, analytics dashboard.

- **Frontend:** Next.js 15 (App Router, TypeScript)
- **Backend:** FastAPI (Python, async)
- **Database:** PostgreSQL 16 · **Cache/queue:** Redis
- **Payments:** Razorpay

## Document Index

| # | Document | Contents |
|---|---|---|
| 1 | [System Overview](docs/01-system-overview.md) | Goals, constraints, principles, request flows, diagrams |
| 2 | [Backend Architecture](docs/02-backend-architecture.md) | FastAPI structure file-by-file, layers, middleware, jobs, caching |
| 3 | [Database Schema](docs/03-database-schema.md) | Every table, column, type, constraint, index, ERD, stock consistency |
| 4 | [API Specification](docs/04-api-specification.md) | Every endpoint: contract, auth, request/response, errors |
| 5 | [Auth & Security](docs/05-auth-security.md) | Token lifecycle, rotation, RBAC, threat model, security checklist |
| 6 | [Payments (Razorpay)](docs/06-payments-razorpay.md) | Order lifecycle, checkout sequence, webhook handling, reconciliation |
| 7 | [Frontend Architecture](docs/07-frontend-architecture.md) | Next.js routes, components, state, data fetching, UX flows |
| 8 | [Admin & Analytics](docs/08-admin-analytics.md) | Admin workflows, role model, metric definitions (SQL) |
| 9 | [Infrastructure & Deployment](docs/09-infrastructure-deployment.md) | Docker, CI/CD, environments, observability, backups, scaling |
| 10 | [Testing & Quality](docs/10-testing-quality.md) | Test strategy, suites, seed data, definition of done |

## Stack (final)

| Layer | Choice | Notes |
|---|---|---|
| Framework (web) | Next.js 15, TypeScript, App Router | SSR/ISR storefront, SPA-style admin |
| Backend framework | FastAPI + Pydantic v2 | async, auto OpenAPI at `/docs` |
| ORM / Migrations | SQLAlchemy 2.0 async + Alembic | type-safe queries, versioned migrations |
| Database | PostgreSQL 16 | relational core, window functions for analytics |
| Cache / jobs | Redis 7 + ARQ | rate limits, sessions blacklist, background jobs |
| Auth | JWT HS256 (15 min) + rotating refresh tokens (7 d) | shared secret with Next.js middleware |
| Password hashing | argon2-cffi | `argon2id`, tunable params |
| Payments | Razorpay Orders API + Checkout.js + webhooks | HMAC-SHA256 verification |
| Styling / UI | Tailwind CSS + shadcn/ui + lucide-react | dark mode via next-themes |
| Data fetching (FE) | TanStack Query + typed API client | server state |
| Cart state | Zustand (guest) + DB cart (authed) | merge on login |
| Charts | Recharts | analytics dashboard |
| Email | Resend + Jinja2 templates (backend-sent) | transactional |
| Images | Cloudflare R2 / S3 presigned uploads | local dev: local storage |
| Validation | Pydantic (BE) + Zod (FE) | shared concepts |
| Testing | Pytest + httpx (BE), Vitest + Playwright (FE) | unit/E2E |
| Lint/format | ruff + mypy (BE), eslint + prettier (FE) | CI-enforced |
| Hosting | Vercel (FE) · Docker on Railway/Render (BE) | Neon/Supabase Postgres, Upstash Redis |

## Monorepo Layout

```
ecommerce/
├── ARCHITECTURE.md          ← you are here
├── docs/                    ← the 10 architecture documents
├── frontend/                # Next.js 15 application
├── backend/                 # FastAPI application
├── docker-compose.yml       # full local environment
├── docker-compose.prod.yml  # self-hosted production variant (optional)
├── .github/workflows/       # CI/CD
├── .env.example             # copied → frontend/.env, backend/.env by setup script
└── scripts/                 # setup.sh, seed.py entrypoint helpers
```

## Build Phases (implementation order)

1. **Foundation** — monorepo scaffold, docker-compose, config, DB models +
   migrations, JWT auth, RBAC deps, health checks
2. **Catalog & Cart** — categories, products, variants, list/detail endpoints,
   cart with guest→user merge, storefront pages
3. **Checkout & Payments** — Razorpay orders, Checkout.js, webhooks, stock
   reservation, order history, confirmation emails
4. **Admin Panel** — product/category/coupon/user CRUD, image uploads,
   order management workflows
5. **Analytics Dashboard** — aggregation endpoints, KPI cards, charts
6. **Hardening & Launch** — tests, rate limiting, observability, seeds, CI/CD,
   deploy, docs/UI polish

Each phase ends with a running, testable system — no phase leaves the app broken.
