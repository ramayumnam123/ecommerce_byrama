# 04 — API Specification

Base URL: `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:8000/api` in dev,
`https://api.example.com/api` in prod). All JSON unless noted. Auth = `Authorization: Bearer <access>` unless marked 🔓 public.

Errors: envelope from [02 Backend](02-backend-architecture.md#4-error-contract-canonical).
Pagination: `?page=1&page_size=20` → `{items, page, page_size, total, pages}`.

## 1. Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/healthz` | 🔓 | liveness (no db) |
| GET | `/api/readyz` | 🔓 | checks Postgres + Redis |

## 2. Auth

| Method | Path | Auth | Body / Params |
|---|---|---|---|
| POST | `/api/auth/signup` | 🔓 (5/min/IP) | `{email, password, full_name}` |
| POST | `/api/auth/verify-email` | 🔓 | `{token}` |
| POST | `/api/auth/resend-verification` | 🔓 | `{email}` (always 200, no enumeration) |
| POST | `/api/auth/login` | 🔓 (5/min/IP) | `{email, password}` |
| POST | `/api/auth/refresh` | 🔓 (cookie) | httpOnly refresh cookie |
| POST | `/api/auth/logout` | 🔓 (cookie) | revokes presented refresh token |
| POST | `/api/auth/forgot-password` | 🔓 | `{email}` (always 200) |
| POST | `/api/auth/reset-password` | 🔓 | `{token, new_password}` |
| GET | `/api/auth/me` | ✅ | → user profile |
| PATCH | `/api/auth/me` | ✅ | `{full_name, phone}` |

**Signup → 201** `{user, access_token, token_type:"bearer", expires_in}` +
`Set-Cookie: refresh_token` (httpOnly, Secure, SameSite=Lax, Path=/api/auth).
Signup sends verification email (ARQ); login works but `email_verified=false`
blocks `FORBIDDEN/EMAIL_NOT_VERIFIED` only on checkout.

Password policy: ≥ 8 chars, 1 upper, 1 digit, ≤ 72 bytes (argon2 input cap);
checked → `422 WEAK_PASSWORD`.

## 3. Users (self-service)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/users/addresses` | ✅ | list mine |
| POST | `/api/users/addresses` | ✅ | create (max 10 → 409) |
| PATCH | `/api/users/addresses/{id}` | ✅ | update; `is_default=true` swaps default |
| DELETE | `/api/users/addresses/{id}` | ✅ | soft unassign |
| GET | `/api/users/orders` | ✅ | my orders (paginated, enriched `items[]`) |
| GET | `/api/users/orders/{id}` | ✅ | detail (only own → 403) |
| POST | `/api/users/orders/{id}/cancel` | ✅ | allowed while PENDING |
| GET | `/api/users/reviews` | ✅ | my reviews |

## 4. Catalog (public reads)

| Method | Path | Auth | Query / Notes |
|---|---|---|---|
| GET | `/api/categories` | 🔓 (60s Redis) | tree `{id,name,slug,children[],image_url}` |
| GET | `/api/products` | 🔓 | `q, category (slug), min_price, max_price, color, size, in_stock, sort (price_asc\|price_desc\|newest\|rating), page` |
| GET | `/api/products/{slug}` | 🔓 | detail: product + images + variants[] (each w/ price, stock, attributes) + rating aggregate |
| GET | `/api/products/{slug}/reviews` | 🔓 | paginated, only `is_published` |
| POST | `/api/revalidate` | 🔒 secret header `X-Internal-Token` | `{tags:["product/{id}"]}` from Next.js |

Response example (detail, trimmed):

```json
{
  "id": "…", "slug": "merino-crew-tshirt", "name": "Merino Crew T-Shirt",
  "description": "…", "images": [{"url": "...", "alt": "..."}],
  "variants": [
    {"id": "…", "name": "Red / M", "price": 149900, "compare_at_price": 199900,
     "stock": 12, "attributes": {"color": "Red", "size": "M"}, "sku": "TSH-RED-M"}
  ],
  "rating": {"average": 4.5, "count": 23}
}
```

## 5. Cart

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/cart` | either | resolves user cart (or guest via `X-Guest-Token` header); returns lines w/ product summary, `subtotal` |
| POST | `/api/cart/items` | either | `{product_variant_id, quantity}` upsert (max qty 99, stock-capped) |
| PATCH | `/api/cart/items/{variantId}` | either | `{quantity}` (0 = delete) |
| DELETE | `/api/cart/items/{variantId}` | either | remove line |
| DELETE | `/api/cart` | either | clear cart |
| POST | `/api/cart/merge` | ✅ | body `{guest_token}` → merge guest cart into user cart (sums quantities), atomically |

Guest carts: `X-Guest-Token: <uuid>` header issued by frontend on first add,
stored in cookie. Merge on login.

## 6. Coupons

| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/api/coupons/validate` | either | `{code, subtotal}` → `{valid, discount_amount, message}` |

## 7. Checkout & Payments

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/checkout/quote` | ✅ | `{address_id, coupon_code?}` → `{subtotal, discount, shipping, tax, total, currency}` (preview, no state changes) |
| POST | `/api/checkout/start` | ✅ | body: `{address_id, coupon_code?, guest_token?, notes?}`; `Idempotency-Key` header optional → 409 on replays; → `{order: {...status: PENDING}, razorpay: {order_id, amount, currency, key_id}}` |
| POST | `/api/checkout/verify` | ✅ | `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` → validates the same HMAC as webhook (client-callback safety net) → `{order.status}` |
| GET | `/api/orders/{id}` | ✅ | order detail (owner or admin) |
| POST | `/api/orders/{id}/cancel` | ✅ | owner cancel if PENDING → stock restore |

Direct `POST /api/webhooks/razorpay` (Razorpay server → us): see doc 06.

## 8. Media

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/media/presign` | ✅ ADMIN | `{filename, content_type}` → `{upload_url, public_url}`; content-type allowlist jpeg/png/webp; ≤ 5 MB |
| DELETE | `/api/media/{key}` | ✅ ADMIN | soft delete/ref-count check |

## 9. Admin (all: `require_roles(ADMIN)` + audit-logged writes)

### 9.1 Products / Categories

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/products` | incl. `deleted_at` w/ `include_deleted=true`; `q, category_id, page` |
| POST | `/api/admin/products` | `{name, description, category_id, images[], variants[], is_active}` |
| GET/PATCH/DELETE | `/api/admin/products/{id}` | DELETE = soft delete (`deleted_at=now`, `is_active=false`); variant/price edits create new rows where needed |
| POST | `/api/admin/products/{id}/variants` | add variant |
| PATCH/DELETE | `/api/admin/products/variants/{id}` | DELETE allowed if never sold (else 409) |
| POST | `/api/admin/products/{id}/images` | reorder/attach uploaded image URLs |
| GET/POST/PATCH/DELETE | `/api/admin/categories[/...]` | slug auto-gen + uniqueness check |

### 9.2 Coupons
CRUD `/api/admin/coupons` (+ `GET /api/admin/coupons/{id}/usages`).
Deactivation over delete once used.

### 9.3 Orders

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/orders` | filters: status, date range, q (order no./email), page |
| GET | `/api/admin/orders/{id}` | full incl. payment + raw webhook payloads |
| PATCH | `/api/admin/orders/{id}/status` | `{status, tracking_number?, carrier?}`; legal transitions enforced (state machine in order_service); e.g. PENDING→CANCELLED restores stock; PAID→SHIPPED needs tracking ≥ optional |
| POST | `/api/admin/orders/{id}/refund` | `{amount, reason}` → Razorpay refund call → status REFUNDED + stock restore rule |

### 9.4 Users

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/users` | `q, role, is_active, created_after`, page |
| PATCH | `/api/admin/users/{id}` | `{is_active, role}`; cannot demote self; audit |

### 9.5 Analytics (`/api/admin/analytics`, all: `period=|7d\|30d\|90d\|custom&from&to`)

| Path | Returns |
|---|---|
| `GET /summary` | `{revenue, orders_count, aov, units_sold, customers, conversion_placeholder, deltas_vs_prev}` |
| `GET /revenue-by-day` | `[{date, revenue, orders}]` |
| `GET /top-products` | `[{product_id, name, units, revenue}]` (limit 10) |
| `GET /sales-by-category` | `[{category, share}]` |
| `GET /customer-growth` | `[{date, new_customers, cumulative}]` |
| `GET /low-stock` | `[{variant_id, sku, product_name, stock}]` (stock < 5) |

SQL behind each: [08 Admin & Analytics](08-admin-analytics.md).

### 9.6 Audit
`GET /api/admin/audit` (filter actor/entity/date, page).

## 10. Rate Limits (per key → 429 + Retry-After)

| Route | Limit |
|---|---|
| auth signup/login/resend/forgot | 5/min per IP |
| catalog GET | 120/min per IP (also CDN-shielded) |
| cart mutating | 60/min per identity |
| checkout/start + verify | 10/min per user |
| admin writes | 60/min per user |
| webhooks | exempt (signature check) |
