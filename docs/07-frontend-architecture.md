# 07 — Frontend Architecture (Next.js 15)

## 1. Decisions

- **App Router**, React Server Components by default; `"use client"` only for
  interactive islands (cart drawer, forms, charts, filters).
- TypeScript **strict**; shared API types generated from FastAPI's OpenAPI
  (`openapi-typescript` + `openapi-fetch` typed client) — no hand-written types.
- Styling: Tailwind v4 + shadcn/ui + lucide; `next-themes` dark mode.
- Data: TanStack Query for dynamic reads; RSC `fetch` + `revalidate` tags for
  SEO pages (product, category).
- Cart + checkout state: Zustand store hydrated from `GET /api/cart`.

## 2. Route Tree (file-by-file)

```
frontend/
├── src/
│   ├── middleware.ts                    # /admin, /account guards (jose jwtVerify)
│   ├── app/
│   │   ├── (storefront)/
│   │   │   ├── layout.tsx      # Header + Footer + CartDrawer host, SEO meta
│   │   │   ├── page.tsx                  # home: hero, categories, featured, social proof
│   │   │   ├── products/page.tsx         # catalog: filters, sort, pagination (searchParams → SSR)
│   │   │   ├── products/[slug]/page.tsx  # PDP (ISR, tag `product/{id}`)
│   │   │   ├── categories/[slug]/page.tsx
│   │   │   ├── cart/page.tsx
│   │   │   ├── checkout/page.tsx         # auth-required (redirect /signin)
│   │   │   ├── checkout/success/page.tsx
│   │   │   ├── (account)/
│   │   │   │   ├── account/page.tsx        # profile, quick stats
│   │   │   │   ├── account/orders/page.tsx + [id]/page.tsx
│   │   │   │   ├── account/addresses/page.tsx
│   │   │   │   ├── account/reviews/page.tsx
│   │   ├── (auth)/signin, signup, forgot-password, reset-password, verify-email
│   │   ├── admin/
│   │   │   ├── layout.tsx      # sidebar shell (server) + <RequireAdmin>(client)
│   │   │   ├── page.tsx        # analytics dashboard (charts — see doc 08)
│   │   │   ├── analytics/page.tsx
│   │   │   ├── products/page.tsx + products/new + [id]/edit
│   │   │   ├── orders/page.tsx + [id]/page.tsx
│   │   │   ├── coupons/page.tsx + new + [id]/edit
│   │   │   ├── customers/[id]/page.tsx, customers/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── audit/page.tsx
│   ├── app/api/revalidate/route.ts       # receives backend purge calls (secret)
│   ├── components/
│   │   ├── ui/                 # shadcn primitives
│   │   ├── storefront/
│   │   │   ├── header.tsx, footer.tsx, cart-drawer.tsx, cart-line.tsx
│   │   │   ├── product-card.tsx, product-grid.tsx, filter-sidebar.tsx,
│   │   │   ├── variant-picker.tsx, quantity-stepper.tsx, review-list.tsx,
│   │   │   └── add-to-cart.tsx (client — variant + qty + stock logic)
│   │   ├── checkout/
│   │   │   ├── address-form.tsx, coupon-field.tsx, order-summary.tsx,
│   │   │   └── razorpay-button.tsx (loads checkout.js, handles callback → /verify)
│   │   ├── admin/              # data-table.tsx, product-form.tsx, order-details.tsx,
│   │   │                         kpi-card.tsx, charts (via recharts), image-uploader.tsx
│   │   └── shared/             # pagination.tsx, empty states, skeleton loaders,
│   │                             form (react-hook-form + zod), toast host
│   ├── lib/
│   │   ├── api.ts              // openapi-fetch client, auth header injection, 401→refresh queue
│   │   ├── auth.ts             // client session helpers (me query)
│   │   ├── cart-store.ts       // zustand (guest token, drawer state, optimistic lines)
│   │   ├── money.ts            // ₹ formatting from paise
│   │   └── seo.ts              // metadata helpers, JSON-LD builders (Product/Offer/Breadcrumb)
│   └── styles/globals.css
├── next.config.ts             // images.remotePatterns (R2), headers(), typedRoutes
├── e2e/                       // Playwright specs
└── .env.example
```

## 3. Rendering Strategy

| Route | Mode | Revalidate |
|---|---|---|
| `/`, `/categories/[slug]` | ISR | 5 min + tag purge on mutation |
| `/products/[slug]` | ISR | tag `product/{id}` (purged via `/api/revalidate`) |
| `/products` list | SSR (searchParams) | per-request (user-filters) |
| `/cart`, `/checkout`, `/admin/**`, `/account/**` | client-dynamic | always fresh, `staleTime: 0` |

- Product images: `next/image` w/ R2 remotePatterns; LCP = product hero image,
  sized/`priority`ed on PDP.
- SEO: per-page metadata + OpenGraph + JSON-LD (`Product`, `BreadcrumbList`,
  `ItemList` for catalog; sitemap.ts + robots.ts).

## 4. State Ownership

| State | Owner | Lifespan |
|---|---|---|
| Server data (products, orders, me) | TanStack Query + RSC cache | per-query |
| Cart lines | Zustand ⇄ optimistic, source of truth = backend | session + persistent (guest cookie) |
| Forms (checkout, admin) | react-hook-form + zod schemas | form session |
| UI (drawer open, theme, toasts) | Zustand/atoms | ephemeral |
| Auth tokens | access in memory + refresh cookie; no localStorage access token | 15 min / 7 d |

## 5. Auth Integration

- `middleware.ts` verifies access cookie (jose, HS256) for guarded routes.
- Client fetch wrapper: on 401 → single-flight `POST /auth/refresh` → retry
  original once; on fail → clear + `/signin?next=…`.
- SSR pages reach the API with the access header when present for personalization;
  public content renders regardless.

## 6. Checkout UX (happy path)

1. `/checkout` → address select-or-create (react-hook-form + zod, Google
   Places optional later) → coupon → totals summary (from `/quote`)
2. Place order (`Idempotency-Key` UUID) → `/checkout/start` → Razorpay modal
3. success handler → `/checkout/verify` → toast + redirect
   `/checkout/success?order={order_number}` (email on the way)
4. failure → toast w/ reason (429/OUT_OF_STOCK etc.) + cart intact
5. Network blip on success callback → success page polls order status (already
   PAID via webhook) — never shows failure for a captured payment.

## 7. Admin UX

- shadcn tables with column sort/filter, server-side pagination;
  loaders + empty states; destructive actions get `ConfirmDialog` +
  typed errors from the API envelope surfaced as toasts.
- Product form: sections (basics / images [drag-drop + R2 presign] /
  variants [editable grid] / SEO) with dirty-form guard.
- Order page: status timeline, payment info, tracking-quick-set, refund dialog.

## 8. Accessibility & Performance Budget

- WCAG AA target; focus management in drawer/dialog; aria labels on interactive islands.
- Lighthouse (mobile) targets: PDP LCP < 2.5s, CLS < 0.1, TBT < 200ms on 4G;
  front bundle: route JS ≤ 90 kB gzip for storefront pages (charts only in admin).
