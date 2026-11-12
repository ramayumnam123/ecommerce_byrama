# Maison Storefront & Admin

Next.js 15 storefront and admin console for the FastAPI e-commerce API in
[`../backend`](../backend). Server Components by default, TypeScript strict,
Tailwind CSS v4 + shadcn/ui, TanStack Query, Zustand cart, a generated
`openapi-fetch` client, and Recharts only inside `/admin`.

## Requirements

- Node.js 20+ and npm
- Python 3.12+ with the backend dependencies installed in `backend/.venv`
- A running FastAPI instance and seeded database (see the root README)

## Quickstart

```powershell
# Terminal 1 — API (from the repository root)
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The API docs are at
[http://localhost:8000/docs](http://localhost:8000/docs).

If the database has not been seeded yet:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m scripts.seed --with-demo-orders
```

## Seed accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@local.dev` | `Admin1234` |
| Customers | `demo.customer1@example.com` … `demo.customer6@example.com` | `Demo1234` |

Demo customers are email-verified and have order history. Checkout uses the
backend's mock Razorpay path when gateway keys are absent; the UI labels it
**dev mode** and shows a simulated-payment step.

## Environment variables

Create `frontend/.env.local` when you need to override the defaults:

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | Public API base. A trailing `/api` is stripped for the client origin; API calls still use generated `/api/...` paths. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Canonical/OG URLs and absolute links. |
| `REVALIDATE_SECRET` | unset | Shared secret for `POST /api/revalidate` tag purges from the backend. The endpoint returns `NOT_CONFIGURED` until this is set. |

Server-side reads use `NEXT_PUBLIC_API_URL` as well; keep it reachable from the
Next.js process, not just the browser.

## Architecture at a glance

| Area | Implementation |
|---|---|
| Routing | Next.js App Router with `(storefront)`, `(auth)`, `(account)`, and `admin` route groups. Server Components fetch catalogue data; interactive screens are client islands. |
| API client | `src/lib/api-types.d.ts` is generated from the live OpenAPI schema. `src/lib/api.ts` wraps `openapi-fetch`, injects the in-memory access token or guest token, and retries once after a single-flight refresh on `401`. |
| Auth | Access token in memory only; refresh token lives in the API's httpOnly `Path=/api/auth` cookie. `session_hint` is a non-secret cookie used by `middleware.ts` for fast route redirects; FastAPI re-authorizes every request. |
| Data fetching | TanStack Query for client reads/mutations, cache invalidation after writes, and typed error toasts including 429 `Retry-After` countdowns. |
| Cart | Zustand mirrors the backend cart, creates a guest token cookie, and merges the guest cart on sign-in. |
| Money | Integer paise end-to-end; formatting happens only at the display boundary via `src/lib/money.ts`. |
| Admin | Role-guarded shell with catalogue, orders, coupons, customers, categories, audit log, settings, and Recharts dashboards. Chart code is isolated to `/admin`. |
| SEO | Metadata builders, canonical URLs, sitemap/robots, JSON-LD, and no-index on account/admin/checkout. |
| Theme | `next-themes` dark mode with system preference support. |

### Main routes

| Route | Scope |
|---|---|
| `/` | Home, categories, featured products |
| `/products`, `/products/[slug]`, `/categories/[slug]` | Catalogue, filters, PDP, reviews |
| `/cart` | Cart, coupons, quantity changes |
| `/checkout`, `/checkout/success` | Address, quote, mock/real payment, confirmation |
| `/signin`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` | Auth flows |
| `/account`, `/account/orders`, `/account/orders/[id]`, `/account/addresses`, `/account/reviews` | Customer account |
| `/admin` | Dashboard and KPIs |
| `/admin/analytics` | Full analytics and CSV export |
| `/admin/products`, `/admin/products/new`, `/admin/products/[id]/edit` | Catalogue management |
| `/admin/orders`, `/admin/orders/[id]` | Fulfilment, refunds, cancellation |
| `/admin/coupons`, `/admin/customers`, `/admin/categories` | Commerce management |
| `/admin/audit`, `/admin/settings` | Audit feed and read-only configuration/maintenance |

## Scripts

```powershell
npm run dev        # Next.js dev server on :3000
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run gen:api    # regenerate src/lib/api-types.d.ts from :8000/openapi.json
npm run test:e2e   # Playwright (starts API + frontend if they are down)
```

Run `npm run gen:api` after any backend schema change, then `npm run typecheck`.

## End-to-end tests

One-time browser install:

```powershell
npx playwright install chromium
```

Run the suite:

```powershell
npm run test:e2e

# or, from frontend/, manage the API health check and cleanup around the run
.\scripts\e2e.ps1

# focused or visible runs
.\scripts\e2e.ps1 -Grep "checkout|admin"
.\scripts\e2e.ps1 -Headed
```

`playwright.config.ts` starts the FastAPI process from `backend/.venv` and the
Next.js dev server when they are not already listening. `scripts/e2e.ps1` does
the same health check for the API, captures backend logs under `test-results/`,
and stops only an API process that the script itself started. Override the
targets with `E2E_BASE_URL` and `E2E_API_ORIGIN`.

Specs run serially (`workers: 1`) because they share a seeded database and
because refresh tokens rotate on every use:

| Spec | Coverage |
|---|---|
| `storefront.spec.ts` | Home, catalogue, category navigation, search, PDP add-to-bag |
| `cart.spec.ts` | Quantity persistence, item removal, coupon save/remove |
| `auth.spec.ts` | Guarded-route return, invalid login, signup, admin denial, sign-out |
| `checkout.spec.ts` | Coupon quote, mock payment, paid order, address creation, invalid coupon |
| `account.spec.ts` | Overview/orders/reviews navigation, order detail, address CRUD |
| `admin.spec.ts` | Dashboard/analytics, customer search, settings, product create/archive, coupon create/delete, ship/deliver |

### Backend mutations and cleanup

The E2E suite exercises real API writes against the seeded database:

- Test-created addresses and carts are removed in `afterEach` where possible.
- Products and coupons are soft-deleted; coupons that have already been
  redeemed are deactivated instead of deleted (`COUPON_IN_USE`).
- Users created by signup tests persist, because the API has no account-delete
  endpoint.
- Orders cannot be deleted. A PAID order can be cancelled while it is still
  `PAID`, but shipped/delivered orders are terminal. The admin lifecycle test
  therefore leaves a delivered order behind, and stock is consumed.
- Cleanup is best-effort so it never masks the original test failure. Re-seed
  the database if you need a completely pristine dataset after a failed run.
- Auth tests inject a unique synthetic `X-Forwarded-For` to stay under the
  backend's per-IP auth rate limit. Each test logs in fresh because refresh
  cookies are single-use.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `NEXT_PUBLIC_API_URL` changes have no effect | Restart `npm run dev`; `NEXT_PUBLIC_*` values are inlined at build/start time. |
| API calls fail with 401 after a long idle period | The access token expired. Reload a guarded page so the client can refresh from the httpOnly cookie, or sign in again. |
| Mutations return `429` | The backend rate limiter is active. Wait for the UI countdown, or wait a minute before rerunning the test. |
| E2E cannot find a product with stock | Re-seed demo data or run the suite against a database with active, in-stock products. Tests choose an in-stock variant dynamically. |
| Type errors after a backend change | Start the API on `:8000`, run `npm run gen:api`, then `npm run typecheck`. |
| Playwright reports a missing browser | Run `npx playwright install chromium`. |

## Status

| Phase | Scope | State |
|---|---|---|
| F1 | Scaffolding, typegen rail, providers, theme | Done |
| F2 | Typed API client, auth/session, money, errors, cart store | Done |
| F3 | Storefront shell, home, cart drawer | Done |
| F4 | Catalogue, filters, PDP, reviews, JSON-LD | Done |
| F5 | Auth pages, middleware guards, cart, account | Done |
| F6 | Checkout, coupons, mock/real payment, success | Done |
| F7 | Admin shell and CRUD screens | Done |
| F8 | Dashboard, analytics, CSV export, charts | Done |
| F9 | SEO, accessibility, error/loading states, performance | Done |
| F10 | Playwright suite, E2E script, README | Done |
