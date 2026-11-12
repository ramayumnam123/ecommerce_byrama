# 08 — Admin Panel & Analytics Dashboard

## 1. Admin Roles & Access

- Single role `ADMIN` (v1): full access to `/admin/*` + `/api/admin/*`.
- Future-proofing: permissions table (doc 05 note) if multiple staff roles needed.
- All admin mutations → `audit_logs` (actor, entity, diff, ip, request_id).

## 2. Admin Panel Screens

| Screen | Key interactions |
|---|---|
| **Dashboard** (`/admin`) | KPI cards + revenue/orders charts + low-stock list + recent orders (see §3) |
| **Analytics** (`/admin/analytics`) | full-screen charts + date-range picker (7d/30d/90d/custom), CSV export |
| **Products** (`/admin/products`) | searchable/sortable table (price, stock, status, category); soft delete; per-row quick stock edit |
| **Product form** (`new`/`[id]/edit`) | tabs: Basics (name, slug auto, description, category, status) · Images (drag-drop, presigned upload to R2, reorder, alt text) · Variants (inline grid: name, sku, price, compare-at, stock, attributes chips) · SEO preview. Dirty-guard, zod validation mirrors server |
| **Categories** | tree editor (drag order), soft deactivation |
| **Orders** (`/admin/orders`) | filter by status/date/search; row → detail drawer: items, snapshots, payment payloads, address, timeline |
| **Order detail** | status actions (ship w/ tracking, cancel, refund) each gated to legal transitions; customer note + admin note; printable invoice link |
| **Coupons** | create/edit (type, value, min-order, per-user limit, window, max uses), usage list, activate/deactivate |
| **Customers** | list w/ filters (role, active, joined); detail: profile, orders, addresses; deactivate/reactivate; bulk export CSV |
| **Settings** | store name, support email, shipping fee, free-ship threshold, tax % — writes `settings` table |
| **Audit** | filter actor/entity/date; request_id links to Sentry |

## 3. Analytics — Metric Definitions (authoritative SQL)

Revenue basis: `orders WHERE status IN ('PAID','SHIPPED','DELIVERED') AND paid_at BETWEEN…`
(Collapsed REFUNDED-in-full orders excluded; partial refunds subtract refund_amount.)
All queries parameterized by `period`; deltas compare the equal-length preceding window.

```sql
-- summary: revenue, orders, AOV, units
SELECT
  COALESCE(SUM(o.total - COALESCE(o.refund_amount,0)),0)        AS revenue,
  COUNT(*)                                                      AS orders_count,
  COALESCE(SUM(l.quantity),0)                                   AS units_sold,
  COALESCE(SUM(o.total),0) / NULLIF(COUNT(DISTINCT o.user_id),0) AS revenue_per_customer
FROM orders o LEFT JOIN order_items l ON l.order_id = o.id
WHERE o.status IN ('PAID','SHIPPED','DELIVERED')
  AND o.paid_at >= :from AND o.paid_at < :to;
-- aov = revenue / orders_count (service computes)

-- revenue_by_day (fills missing days in service)
SELECT date_trunc('day', o.paid_at) AS date,
       SUM(o.total) AS revenue, COUNT(*) AS orders
FROM orders o
WHERE o.status IN ('PAID','SHIPPED','DELIVERED')
  AND o.paid_at >= :from AND o.paid_at < :to
GROUP BY 1 ORDER BY 1;

-- top_products
SELECT oi.product_name, SUM(oi.quantity) AS units,
       SUM(oi.line_total) AS revenue
FROM order_items oi JOIN orders o ON o.id = oi.order_id
WHERE o.status IN ('PAID','SHIPPED','DELIVERED')
  AND o.paid_at >= :from AND o.paid_at < :to
GROUP BY oi.product_name ORDER BY revenue DESC LIMIT 10;

-- sales_by_category (share of revenue)
SELECT c.name AS category, SUM(oi.line_total) AS revenue
FROM order_items oi
JOIN orders  o  ON o.id = oi.order_id
JOIN product_variants v ON v.id = oi.product_variant_id
JOIN products p ON p.id = v.product_id
LEFT JOIN categories c ON c.id = p.category_id
WHERE o.status IN ('PAID','SHIPPED','DELIVERED') AND o.paid_at >= :from AND o.paid_at < :to
GROUP BY c.name ORDER BY revenue DESC;

-- customer_growth
SELECT date_trunc('day', created_at) AS date, COUNT(*) AS new_customers
FROM users WHERE role='CUSTOMER' AND created_at >= :from AND created_at < :to
GROUP BY 1 ORDER BY 1;

-- low_stock (threshold 5)
SELECT v.id, v.sku, p.name AS product_name, v.stock
FROM product_variants v JOIN products p ON p.id = v.product_id
WHERE v.is_active AND p.is_active AND v.stock <= 5
ORDER BY v.stock ASC;
```

Scale note (>100k paid orders): materialized rollup table
`rollup_daily_orders(date, revenue, orders_count, units)` refreshed hourly by
ARQ; dashboard reads rollup + live-tail for today.

## 4. Dashboard Component Mapping (Recharts)

| Widget | Chart | Data |
|---|---|---|
| KPI row (4–5 cards) | — | `/summary` (+ delta arrows) |
| Revenue trend | AreaChart (gradient) | `/revenue-by-day` |
| Orders per day | BarChart | `/revenue-by-day` |
| Top products | horizontal BarList | `/top-products` |
| Category split | DonutChart | `/sales-by-category` |
| New customers | LineChart (cumulative toggle) | `/customer-growth` |
| Low stock | Table (alert badge) | `/low-stock` |
| Recent orders | compact table → links | `/admin/orders` |

## 5. Order Management State Permissions

Admin actions (server-enforced, from state machine doc 06):

| From | Allowed |
|---|---|
| PENDING | cancel (notify user, restock) |
| PAID | ship (tracking required > optional), cancel (refund if captured), refund partial/full |
| SHIPPED | mark delivered, refund (via gateway), update tracking |
| DELIVERED | refund (return flow) |
| final states | read-only |

Every action → audit log + (cancel/refund) email to customer.

## 6. Operational Runbooks (linked from admin UI)

- Renders in `/admin/settings` → tabs: Payments (webhook secret rotate
  checklist), Shipping & tax, Emails (Resend domain status)
- "Re-run reconciliation now" button (admin-only, hits ARQ job directly)
