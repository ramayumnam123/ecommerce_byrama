# 03 — Database Schema (PostgreSQL 16)

Conventions: snake_case, `UUID` PKs (`gen_random_uuid()`), all timestamps
`timestamptz` (`now()`), money **integer paise** (`BIGINT`), soft delete only on
`products`. Naming convention via SQLAlchemy `naming_convention` (Alembic stable).

## 1. Entity-Relationship Overview

```
users 1─* refresh_tokens        
users 1─* addresses            
users 1─* orders ─* order_items *─1 product_variants ─1 products *─1 categories
                     │
users 1─* carts ─* cart_items ─1 product_variants
users 1─* payments (via orders)      orders *─1 coupons (nullable)
users 1─* reviews *─1 products
admin users → audit_logs
products *─* product_images
```

## 2. Tables

### users
| column | type | constraints |
|---|---|---|
| id | UUID PK | default `gen_random_uuid()` |
| email | VARCHAR(255) | UNIQUE, NOT NULL, CITEXT lower |
| hashed_password | TEXT | NOT NULL (argon2id) |
| full_name | VARCHAR(120) | NOT NULL |
| role | user_role enum | `CUSTOMER` default; `ADMIN` |
| is_active | BOOLEAN | true |
| email_verified_at | TIMESTAMPTZ | NULL until verified |
| created_at / updated_at | TIMESTAMPTZ | tz-aware |

Indexes: `idx_users_email` (unique), `idx_users_role`.

### refresh_tokens
| column | type |
|---|---|
| id (UUID PK), user_id FK→users (CASCADE)
| token_hash (TEXT, SHA-256, indexed) — raw token never stored
| expires_at TIMESTAMPTZ · revoked_at TIMESTAMPTZ NULL
| rotated_from UUID NULL (chain for reuse-detection) · created_at

Indexes: unique `(user_id, token_hash)`-style idx on token_hash.

### addresses
id, user_id FK, line1 (180), line2, city (80), state (80), postal_code (20),
country CHAR(2) default 'IN', phone (20), is_default BOOLEAN, created_at.
Index `(user_id)`; partial unique: one default per user.

### categories
id, name (120), slug VARCHAR(160) UNIQUE, parent_id self-FK NULL,
image_url TEXT NULL, is_active, sort_order INT, created/updated.
Index `(parent_id)`, `lower(slug)` unique.

### products
id, name (180), slug (220) UNIQUE, description TEXT,
category_id FK→categories, is_active BOOL default true,
**deleted_at TIMESTAMPTZ NULL** (soft delete), created_at, updated_at.
Indexes: `(category_id)`, `(is_active, created_at DESC)`,
GIN on `to_tsvector('english', name || ' ' || description)` for full-text search,
trgm GIN on `name` `%` ILIKE fuzzy search.

### product_images
id, product_id FK, url TEXT, alt (200), sort_order INT.
Index `(product_id, sort_order)`.

### product_variants
id, product_id FK, name (120) (e.g. "Red / M"), sku VARCHAR(64) UNIQUE,
price BIGINT (paise) CHECK >= 0, compare_at_price BIGINT NULL (>= price),
stock INT default 0 CHECK >= 0, weight_grams INT NULL (shipping calc),
attributes JSONB `{"size":"M","color":"Red"}`, is_active BOOL, created_at.
Indexes: `(product_id)`, `sku` unique, partial `(stock) WHERE stock < 5`
for low-stock admin page.

### carts
id, user_id FK NULL (guest cart if null), guest_token VARCHAR(64) UNIQUE NULL,
created_at, updated_at. CHECK constraint: exactly one of `user_id`/`guest_token`
is non-null (`CHECK ((user_id IS NULL) <> (guest_token IS NULL))`).
Index `(user_id)`.

### cart_items
id, cart_id FK (CASCADE), product_variant_id FK, quantity INT CHECK 1..99,
created_at, updated_at. Unique `(cart_id, product_variant_id)` — upsert on add.

### coupons
id, code VARCHAR(32) UNIQUE CITEXT, discount_type enum `PERCENT|FIXED`,
value BIGINT (paise or percent int 1-100), min_order_value BIGINT NULL,
max_uses INT NULL, used_count INT default 0, per_user_limit INT default 1,
starts_at / expires_at TIMESTAMPTZ NULL, is_active BOOL, created_at.

### orders
| column | type |
|---|---|
| id UUID PK · order_number VARCHAR(16) UNIQUE (`EC-2026-000012`) |
| user_id FK→users (NULL allowed for guest? **No — v1 login required to buy**) |
| status order_status enum: `PENDING` → `PAID` → `SHIPPED` → `DELIVERED`; `CANCELLED`, `REFUNDED` |
| subtotal BIGINT · discount BIGINT default 0 · shipping_fee BIGINT · tax BIGINT · total BIGINT (all paise, CHECK total >= 0) |
| currency CHAR(3) default 'INR' |
| coupon_id FK NULL |
| shipping_address JSONB (frozen copy of address row) |
| reserved_until TIMESTAMPTZ (stock reservation TTL, +15 min) |
| shipping_method VARCHAR(40) · tracking_number VARCHAR(64) · carrier VARCHAR(40) |
| notes TEXT (customer) · admin_note TEXT |
| paid_at TIMESTAMPTZ · cancelled_at · refund_amount BIGINT NULL |
| created_at · updated_at |

Indexes: `(user_id, created_at DESC)`, `(status)`, `(reserved_until) WHERE status='PENDING'` (TTL job), `paid_at DESC` (analytics).

### order_items
id, order_id FK (CASCADE), product_variant_id FK (restrict),
**product_name VARCHAR(180)**, **variant_name VARCHAR(120)**, **sku VARCHAR(64)**
(all snapshots), **unit_price BIGINT**, quantity INT, line_total BIGINT,
image_url TEXT (frozen). Snapshot columns: no FK updatable drift.

### payments
id, order_id FK UNIQUE-ish (one active per order; refund rows allowed →
use `(order_id, kind)` not unique), kind enum `GATEWAY|REFUND`,
provider VARCHAR(16) default 'razorpay',
provider_order_id VARCHAR(64) UNIQUE, provider_payment_id VARCHAR(64)
UNIQUE NULL, provider_signature TEXT NULL,
amount BIGINT, status enum `CREATED|CAPTURED|FAILED|REFUNDED`,
raw_payload JSONB, created_at, updated_at.
Indexes on `provider_order_id`, `provider_payment_id` (webhook idempotency).

### reviews
id, user_id FK, product_id FK, order_item_id FK NULL (verified-purchase proof),
rating SMALLINT CHECK 1..5, title (140), body TEXT,
is_verified_purchase BOOL default false, is_published BOOL,
unique `(user_id, product_id)`, created_at. Index `(product_id, rating)`.

### audit_logs
id, actor_user_id FK NULL, action VARCHAR(64) (e.g. `product.update`),
entity_type VARCHAR(40), entity_id UUID NULL, diff JSONB, ip INET,
request_id VARCHAR(64), created_at. Index `(created_at DESC)`, `(entity_type, entity_id)`.

### settings
key VARCHAR(64) PK · value JSONB · updated_at — stores store name, support
email, shipping-fee defaults, tax %, free-shipping threshold. Read via a cached
service; admin can edit from Store Settings.

## 3. Triggers / DB-level Guards

- `orders.order_number`: generated in app (transaction-safe suffix), NOT a trigger.
- `price` checks at CHECK level,service-level re-validation for admin input.
- No DB triggers used — logic lives in services for testability.

## 4. Stock Consistency (the critical path)

```
BEGIN;
  SELECT stock FROM product_variants WHERE id=:vid AND is_active FOR UPDATE;
  -- raises OUT_OF_STOCK if stock < qty (no race; row locked)
  UPDATE product_variants SET stock = stock - :qty WHERE id = :vid;
  INSERT order + items (snapshots);
COMMIT;
```

Flow accounting:
| Event | stock |
|---|---|
| checkout (PENDING order) | `-qty` (reserved, `reserved_until` set) |
| payment.captured | no change (already decremented) → status PAID |
| payment.failed / TTL expire / user cancel | `+qty` (restored) |
| admin refund + cancel | `+qty` if before shipped |
| admin manual adjust | delta via admin endpoint + audit log |

Rationale: decrementing only on capture would allow overselling during a
15-min payment window; decrement-then-restore is safer and common practice.

## 5. Alembic Workflow

- Autogenerate from `models/__init__.py` metadata; hand-fix Ns.
- Naming convention ensures `ix_/uq_/fk_/ck_` stable drops/reproducible diffs.
- Every release: one upgrade head, no branches; CI runs
  `alembic upgrade head` against a throwaway Postgres to validate.

## 6. Seed Data

`scripts/seed.py` (idempotent, ReRun-safe):
- Admin user from `SEED_ADMIN_EMAIL/PASSWORD` env
- 4 categories (Electronics, Apparel, Accessories, Home)
- 20 products × 2-4 variants each, realistic INR prices,
  Unsplash/Pixabay placeholder images pre-uploaded pattern for R2/local
- Demo coupon `WELCOME10`, 60 days of fake orders + items + payments so the
  analytics dashboard shows charts immediately (flag `--with-demo-orders`).
