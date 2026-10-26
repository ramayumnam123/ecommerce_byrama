# 11 — Frontend Implementation Plan (Next.js 15 + Admin Dashboard)

The build order for `frontend/`, phase by phase. Every phase ends in a working,
verifiable state; nothing after Phase F1 starts until the previous phase is
demoed green. **Architecture source of truth: `docs/07-frontend-architecture.md`**
(route tree §2, rendering §3, state §4, auth §5, checkout UX §6, admin UX §7).
API contract: `docs/04`. Admin/analytics widgets: `docs/08`. Payment flow: `docs/06`.

Stack (locked from docs/07 §1): Next.js 15 App Router, React Server Components
by default, TypeScript **strict**, Tailwind v4 + shadcn/ui + lucide, TanStack
Query for dynamic reads, Zustand for cart, `openapi-typescript` +
`openapi-fetch` for a **generated, typed API client** (zero hand-written API
types), `jose` in middleware, Recharts only inside `/admin`, `next-themes` dark
mode. npm only — no Docker, no git.

---

## F1 — Scaffolding & tooling rail

1. `npx create-next-app@latest frontend` — TS **strict**, App Router, Tailwind
   v4 (`@tailwindcss/postcss`), ESLint, `src/`, import alias `@/*`.
2. `shadcn@latest init` + add primitives as needed per phase
   (button, input, card, dialog, drawer(vaul), dropdown-menu, select, table,
   tabs, toast(sonner), form, badge, skeleton, separator, sheet, sonner...).
3. Install runtime deps: `@tanstack/react-query`, `zustand`, `react-hook-form`,
   `zod`, `jose`, `lucide-react`, `next-themes`, `recharts`, `sonner`.
   Dev deps: `openapi-typescript`, `@playwright/test`.
4. **Typegen rail**: with the API running on :8000,
   `npm run gen:api` = `openapi-typescript http://localhost:8000/openapi.json -o src/lib/api-types.d.ts`
   (script documented in README; regen after any backend schema change).
   `openapi-fetch` client (`createClient`) gets `paths` typing from that file.
5. Env: `.env.local` + `.env.example` with
   `NEXT_PUBLIC_API_URL=http://localhost:8000/api`,
   `NEXT_PUBLIC_APP_URL=http://localhost:3000`,
   `REVALIDATE_SECRET` (shared with backend for `/api/revalidate`).
6. next config: `images.remotePatterns` covering `localhost:8000` (mock media
   backend) + R2/S3 hostnames for later; `typedRoutes` on; `headers()` for
   long-lived static assets.
7. Wire React Query `QueryClientProvider` (a client `providers.tsx`), `Toaster`
   (sonner), `next-themes` `ThemeProvider`.
8. First-route smoke: a placeholder home page renders with the theme + fonts.

**Exit check:** `npm run dev` boots; `npm run gen:api` produces typed paths from
the live OpenAPI; `/` renders.

## F2 — `lib/` core (the platform the rest builds on)

Files (docs/07 §2 lib/):

| File | Contents |
|---|---|
| `lib/api.ts` | `createClient<paths>()` with `baseUrl = NEXT_PUBLIC_API_URL`; attaches `X-Guest-Token` from the cart store when present; request interceptor injects `Authorization` when an access token is in memory; **401 → single-flight `POST /auth/refresh` (cookie) → retry once → on fail clear session + redirect `/signin?next=`**. Export typed helpers `api.GET/POST/PATCH/DELETE`. |
| `lib/auth.ts` | in-memory access-token holder + `useMe()` (TanStack Query on `/auth/me`, `staleTime: 60s`), `signin/signout/signup` mutations, guest-cart merge on login (`POST /cart/merge {guest_token}`), no token in localStorage — access token lives in memory only, refresh is the httpOnly cookie (Path=/api/auth). |
| `lib/cart-store.ts` | Zustand: lines mirror + optimistic writes, guest token (create-once, persisted in cookie), drawer open state, coupon state; source of truth stays the backend — every action calls the cart API and reconciles on response. |
| `lib/money.ts` | integer-paise → `₹1,499.00` formatter (`Intl.NumberFormat('en-IN')`); never floats through the app. |
| `lib/seo.ts` | `buildMetadata()` (title templates, OG), JSON-LD builders: `Product`, `Offer` (price in paise→rupees), `BreadcrumbList`, `ItemList`. |
| `lib/constants.ts` | free-ship threshold ₹99900, cart max qty 99, sort/filter facets shared with the filter sidebar. |
| `lib/errors.ts` | parse the API error envelope `{"error":{code,message,details,request_id}}` → typed toasts (429 `RATE_LIMITED` shows retry_after; `OUT_OF_STOCK`, `EMAIL_NOT_VERIFIED` special-cased). |

Access-token note: login/signup responses give 15-min `access_token`; refresh is
cookie-based `POST /auth/refresh`. Middleware (F5) uses the cookie for guard
checks; the fetch wrapper (above) is what actually renews access tokens.

## F3 — Storefront shell + home

- `(storefront)/layout.tsx`: `<Header>` (logo → `/`, nav categories from
  `GET /categories`, search box, cart button w/ count, account menu, theme
  toggle) + `<Footer>` + `<CartDrawer>` host.
- `<CartDrawer>` (client, vaul drawer): live lines from cart store, qty
  steppers, remove, subtotal, free-shipping progress bar (₹999 threshold),
  "Checkout" → `/cart` or `/checkout`.
- Home page (ISR 300s): hero, category tiles (`/categories/[slug]`), featured
  grid (`GET /products?sort=newest&page_size=8`), social-proof strip.
  Skeletons for hydration-free loading.
- Product card/grid components (shared by catalog): image (next/image, R2
  patterns), name, price (money.ts), compare-at strike, low-stock badge.

**Exit check:** header/footer/drawer coupled to the real API; home fully
server-rendered with revalidate on `/api/revalidate` secret header.

## F4 — Catalog + PDP (SEO core)

- `/products` — SSR per docs/07 §3: reads searchParams → API
  (`q, category, min_price, max_price, color, size, in_stock, sort, page`);
  `<FilterSidebar>` (client) writes back via `router.push` with URL state;
  pagination from `{items, total, pages}`; `ItemList` JSON-LD.
- `/categories/[slug]` — ISR 300s + tag purge; category hero + product grid.
- `/products/[slug]` — ISR with `generateStaticParams` +
  `revalidate` tag `product/{id}`; images priorities first; variant picker
  (attributes → variant selection, stock-aware), quantity stepper,
  `AddToCart` (client) hitting `POST /cart/items`; rating aggregate +
  paginated `<ReviewList>`; `Product`+`Offer` JSON-LD; related grid.
- Breadcrumbs component + `BreadcrumbList` JSON-LD on both list and PDP.

**Exit check:** filter/sort/pagination URLs shareable; PDP JSON-LD valid;
stock state respected (0 → disabled CTA).

## F5 — Auth pages, guards, cart page, account

- `(auth)` group: `/signin`, `/signup` (zod mirrors server password policy →
  8+ chars, 1 upper, 1 digit; `422 WEAK_PASSWORD` inline), `/forgot-password`,
  `/reset-password?token=`, `/verify-email?token=`. Forms react-hook-form +
  zod; after login: merge guest cart, redirect `?next=` or `/account`.
- `middleware.ts` (jose `jwtVerify` HS256, issuer `${ISSUER}`/audience match):
  guards `/checkout`, `/account/**` (must be signed in), `/admin/**`
  (role claim = ADMIN; else redirect `/signin?next=`). Cookie-only read —
  no API calls in middleware; API re-checks on every request anyway.
- `/cart` page (client): same lines as drawer + coupon field
  (`POST /coupons/validate` → message + discounted subtotal), unlocked at
  checkout step; "proceed".
- `/account` shell (header w/ nav): profile (`PATCH /auth/me`), orders list
  (`GET /users/orders`) + order detail with timeline + cancel button while
  PENDING, addresses CRUD (`/users/addresses`, default swap, max-10 409
  handled), my reviews.

**Exit check:** full session lifecycle: signup → verify-email stub → login →
guest-cart merged → guarded routes redirect when signed out.

## F6 — Checkout (the money path)

Per docs/07 §6 happy path, and docs/04 §7:

1. `/checkout` (client, guarded): address select-or-create (react-hook-form +
   zod), coupon, `<OrderSummary>` from `POST /checkout/quote` (auto-requote on
   address/coupon change).
2. **Place order** → `POST /checkout/start` with `Idempotency-Key: uuid()` per
   attempt-1 (kept across verify retries of the same order); response
   `{order, razorpay:{order_id, amount, key_id, mock}}`.
3. `<RazorpayButton>` loads `checkout.js` (`useEffect` script load):
   - **real mode** (`mock:false`): open modal w/ `key_id`, `order_id`,
     amount/currency, prefill name/email/phone; success handler carries
     `razorpay_*` fields;
   - **mock mode** (`mock:true`): render an internal "Pay (simulated)" step
     that calls dev-only `POST /api/checkout/mock-pay` with the order id —
     same verify flow afterwards. UI shows a clear "dev mode" label.
4. On success → `POST /checkout/verify`; `PAID` →
   redirect `/checkout/success?order={order_number}` (confetti no; email note
   yes); cart cleared. On failure/error → typed toast per `lib/errors.ts`,
   cart intact, order stays PENDING (15-min reservation note shown).
5. `/checkout/success` polls `GET /orders/{id}` for status (webhook may have
   beaten verify; never render failure for a captured payment).
6. Rate-limit coexistence (docs/04 §10): checkout start/verify are 10/min/user —
   the button disables + shows retry-after countdown on `RATE_LIMITED`.

**Exit check:** e2e order placed in mock mode through the UI: quote → start →
(mock) capture → verify → PAID → success page → order visible in
`/account/orders`; stock decremented server-side.

## F7 — Admin shell + catalog/order/coupon/customer CRUD

- `/admin/layout.tsx`: sidebar shell (server) + `<RequireAdmin>` guard
  (middleware + per-page role re-check); collapsible nav; user menu.
- Components: `<DataTable>` (shadcn table + column sort/filter + server
  pagination via query params), `<ConfirmDialog>`, `<KpiCard>`,
  `<ImageUploader>` (presign → PUT → public_url list, reorder, alt text,
  ref-guard delete errors surfaced), `<ProductForm>` (docs/07 §7: sections
  Basics / Images / Variants editable grid / SEO preview; dirty-form guard),
  `<OrderDetails>` (items, payment payloads, address, timeline, status
  actions gated to legal transitions, refund dialog, tracking quick-set).
- Screens:
  - `/admin` dashboard (recharts — see F8)
  - `/admin/products` (searchable table, soft delete, quick stock edit) +
    `new` + `[id]/edit`
  - `/admin/categories` (tree editor, reorder, soft deactivate)
  - `/admin/orders` + `[id]` (filters status/date/q; PENDING→cancel w/ restock,
    PAID→ship/cancel/refund, SHIPPED→deliver/track, DELIVERED→refund-return;
    every action confirmed + audited server-side)
  - `/admin/coupons` (+ new/[id]/edit, usages list, deactivate-over-delete)
  - `/admin/customers` + `[id]` (filters, deactivate/reactivate, CSV export)
  - `/admin/audit` (filter actor/entity/date; request_id chip)
  - `/admin/settings` (store profile, shipping fee, free-ship threshold, tax;
    maintenance tab incl. "Run reservation sweep now" →
    `POST /admin/maintenance/reservations/sweep`)
- All mutations hit the envelope error toasts; lint rule: no admin fetch
  outside `lib/api.ts`.

**Exit check:** create product-with-images-and-variants end-to-end in UI;
order transitions visible + audited; images upload via presign (mock media
backend).

## F8 — Dashboard + analytics (Recharts)

Widget→endpoint mapping straight out of docs/08 §4:

| Widget | Chart | Endpoint |
|---|---|---|
| KPI row (revenue, orders, AOV, units, revenue/customer w/ delta arrows) | — | `/admin/analytics/summary?period=…` |
| Revenue trend | AreaChart (gradient) | `/admin/analytics/revenue-by-day` |
| Orders per day | BarChart | same response (orders series) |
| Top products | horizontal bar | `/admin/analytics/top-products` |
| Category split | Donut/pie w/ legend | `/admin/analytics/sales-by-category` |
| New customers (cumulative toggle) | LineChart | `/admin/analytics/customer-growth` |
| Low stock | table + alert badge | `/admin/analytics/low-stock` |
| Recent orders | compact table → `/admin/orders/[id]` | `/admin/orders?page_size=10` |

- `/admin/analytics`: full-screen variant with **date-range picker**
  (presets 7d/30d/90d + custom from/to) and **CSV export** — client-side
  serialization of the same query results (matches numbers, no extra API).
- Money on charts: rupee formatting via `money.ts`; tooltips Indian-locale
  formatted; empty state when zero orders in window.
- Recharts imports stay inside `admin/` — storefront bundle unaffected.

**Exit check:** dashboard matches Phase-5 analytics SQL spot checks (same
figures as `smoke_analytics` reconciliation).

## F9 — SEO, a11y, performance budget

- `sitemap.ts` (all slugs + categories), `robots.ts` (disallow /admin,
  /account, /checkout), canonical + OG metadata everywhere, JSON-LD validated
  (Google Rich-Results test pass on PDP).
- `POST /api/revalidate` webhook route: verifies `X-Internal-Token` secret,
  purges arriving `tags` (`product/{id}`), logs.
- A11y (WCAG AA): focus trap/restore in drawer & dialogs, aria-labels on icon
  buttons, keyboard-navigable variant picker + data table, `prefers-reduced-motion`
  respected, visible focus rings (not removed).
- Perf budget (docs/07 §8): storefront route JS ≤ 90 kB gzip (charts/libs
  admin-only via route segment isolation), PDP LCP < 2.5 s, CLS < 0.1,
  `next/image` everywhere, `dynamic = "force-dynamic"` only where the table
  says SSR.
- Global error boundary + `not-found.tsx` + loading skeletons for every route.

## F10 — Playwright e2e + final polish

- Playwright chromium config against dev server; specs:
  1. `storefront.spec` — home renders, category → PDP, filter+sort URLs
  2. `cart.spec` — add to cart (guest), drawer math, merge on login
  3. `auth.spec` — signup → verify (DB flip or dev stub) → login → me
  4. `checkout.spec` — mock-pay happy path + failing-coupon toast
  5. `account.spec` — orders list/detail/cancel, addresses
  6. `admin.spec` — product create w/ image presign, order ship transition,
     coupon create, dashboard widgets render with data
- Smoke run helper script `frontend/scripts/e2e.ps1` (boots API if down).
- README updated: frontend quickstart (`npm run dev`, `npm run gen:api`,
  `npx playwright test`), status table Phase 7 row.

---

## Build order & approval gates

| # | Phase | Depends on |
|---|---|---|
| F1 | Scaffolding + typegen rail | — |
| F2 | lib/ core (api/auth/cart/money/seo/errors) | F1 |
| F3 | Storefront shell + home | F2 |
| F4 | Catalog + PDP | F3 |
| F5 | Auth + guards + cart page + account | F2 |
| F6 | Checkout flow | F5 |
| F7 | Admin CRUD screens | F2 |
| F8 | Dashboard + analytics | F7 |
| F9 | SEO + a11y/perf sweep | F4+F6 |
| F10 | Playwright e2e + README | all |

F5 can start in parallel with F4 once F2 lands; checkout (F6) begins after F5.
Each phase is demoed before the next starts — say "proceed" to light up F1
(scaffolding) and I'll continue phase-by-phase with the same pattern.

**Decisions recap baked into this plan:** access token in memory only (refresh
in httpOnly cookie, `Path=/api/auth`); Idempotency-Key sent on checkout/start;
mock-Razorpay path ("Pay (simulated)" step → `/api/checkout/mock-pay`) shown
only when `razorpay.mock` is true in the start response; media via presign
works today with the local mock backend and unchanged when R2 keys appear;
integer paise everywhere, formatted at the last mile; rate-limit 429s surfaced
with countdowns instead of raw errors.

## Out of scope (documented deferrals)

- Google Places address autocomplete (optional later, has a free-text fallback now)
- Email/SMTP domain setup UI (docs/08 §6 *render runbooks* got a links tab in Settings)
- Image CDN transformation params (remotePatterns ready, sharp tuned later)
- Sentry/observability wiring (error envelope already carries request_id — clipboard-ready)
