# 10 — Testing, Quality & Definition of Done

## 1. Test Pyramid

| Level | Tooling | Target |
|---|---|---|
| Unit (BE) | pytest, no I/O — services with fake repos | services logic: coupons, totals, status machine, JWT, money math |
| Integration (BE) | pytest + httpx AsyncClient against real PG (testcontainers / compose service `db-test`) + Redis | routers with auth/RBAC, transactions, stock locking under concurrency |
| Worker tests | pytest-arq using fake clock | reservation TTL release, reconcile branches |
| Unit (FE) | vitest + testing-library | money.ts, cart-store reducers, form validation schemas |
| E2E | Playwright against full docker stack (seeded) | critical user journeys below |
| Contract | after each BE deploy, FE CI runs new OpenAPI diff vs committed `openapi.json` (breaking-change check) | no silent API breakage |

## 2. Critical User Journeys (Playwright)

1. **Signup → verify (test SMTP) → login** → land on account
2. **Browse → search → filter → PDP → pick variant → add to cart (guest) →
   login → cart merged** → lines intact
3. **Checkout (Razorpay test card `4111 1111 1111 1111` on test keys) →
   success** → order PAID (webhook test event) → email received (test SMTP) →
   stock decremented
4. **Purchase with coupon** → totals correct → used_count incremented
5. **Admin**: create product w/ variant + image → appears on storefront in < 1 min (ISR purge)
6. **Admin**: ship PAID order w/ tracking → customer sees SHIPPED
7. **Admin refund** → order REFUNDED → stock restored
8. **Guard rails**: customer blocked from /admin and /api/admin (403);
   expired token → silent refresh retry on protected page

## 3. Concurrency Tests (must pass)

- 50 parallel checkouts on a 10-stock variant → exactly 10 PAID sales possible;
  40 fail with `OUT_OF_STOCK` and no negative stock `(SELECT … FOR UPDATE)`
- Duplicate identical webhook (payment.captured ×2) → second is a no-op 200
- Two login sessions: refresh in A revokes B (reuse detection path)
- Cart upsert race (two POST same variant simultaneously) → single line merged quantities

## 4. Fixtures & Seed (deterministic)

- `conftest.py`: per-test nested transaction rollback (fast, isolated);
  factory-boy style factories: users, catalog, orders.
- Seeded E2E env: known admin `{admin@example.com}`; 3 demo products w/ fixed
  prices; Razorpay test keys from `.env.test`.

## 5. Quality Gates (CI-fail level)

Backend: `ruff check --fix --exit-non-zero-on-fix` · `mypy --strict` ·
`pytest --cov=app --cov-fail-under=80` (services ≥ 90, critical: checkout &
payments & inventory 100% branch) · `pip-audit`.
Frontend: eslint+prettier · `tsc --noEmit` · `vitest --coverage` (lib/ ≥ 80%) ·
`next build` (typedRoutes on) · Playwright on PR-to-main.
Docs rule: any new endpoint in this repo needs schema + test + this-docs update
in the PR.

## 6. Definition of Done (per feature)

1. Service + endpoint + schema + migration (if DB)
2. Tests: unit + integration + happy-path E2E touchpoint
3. Audit-log instrumentation for admin mutations
4. Error cases covered by the API envelope; FE surfaces them as toasts
5. Docs updated (04 API spec / 08 admin) — PR checklist item
6. `make verify` locally green (fmt, lint, mypy, tests, build)

## 7. Launch QA Checklist (used before Phase 6 merge)

- [ ] All Playwright journeys green on **staging** with test keys
- [ ] One real ₹1 production payment + full refund via admin
- [ ] Lighthouse storefront (mobile): Perf ≥ 90, A11y ≥ 90, SEO ≥ 95
- [ ] Security headers verified; helmet-equivalent on API responses
- [ ] Rate limits verified by burst test (429s returned + Retry-After)
- [ ] Sentry releases mapped; 24h soak on staging without new front bugs
- [ ] Backup restore drill executed on a Neon/Supabase point-in-time
