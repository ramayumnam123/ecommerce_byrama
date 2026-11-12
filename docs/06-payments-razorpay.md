# 06 — Payments (Razorpay)

## 1. Scope

- INR checkout via Razorpay **Orders API** + hosted **Checkout.js** modal
  (test mode in dev/staging: `rzp_test_*`; live keys only in prod env).
- Verification is **dual-channel**: client callback (`/checkout/verify`, for
  instant UX) and server webhook (`payment.captured`, authoritative).
- Refunds initiated from admin; reconcile job covers missed webhooks.

## 2. Order/Status Machine

```
                ┌────────────┐
   start ───────▶|  PENDING   │  stock reserved, reserved_until = now+15min
                └──────┬─────┘
        captured (webhook/verify)
                       ▼
                 ┌───────────┐   admin ship w/ tracking
                 |   PAID    │─────────────▶ SHIPPED ──────▶ DELIVERED (manual)
                 └─────┬─────┘
  refund (admin)       │  failed/expired/user cancel (PENDING only)
                       ▼                     ▼
                 ┌───────────┐           CANCELLED (stock restored)
                 |  REFUNDED |  stock restored if pre-shipment
                 └───────────┘
```
Illegal transitions rejected with `409 VALIDATION` + current status detail.

## 3. Checkout Sequence (happy path)

```
FE detail cart ─▶ POST /api/checkout/quote            (preview totals)
FE            ─▶ POST /api/checkout/start
                 ├⟶ validate address, coupon, stock
                 ├⟶ BEGIN: lock variant rows, decrement stock,
                 │        create order(PENDING)+items+payment(CREATED),
                 │        coupon used_count++, COMMIT
                 ├⟶ Razorpay POST /orders {amount, currency, receipt=order_number}
                 └⟶ 200 {order, razorpay:{order_id, amount, currency, key_id}}
FE            ─▶ Razorpay Checkout.js (config from key_id + handler)
Customer      ─▶ pays (UPI/card/netbanking/wallet)
Razorpay      ─▶ POST /api/webhooks/razorpay   {event: payment.captured, …}  [authoritative]
FE handler    ─▶ POST /api/checkout/verify     {order_id, payment_id, signature} [instant]
API           ─▶ idempotent state update → 201 {order.status:"PAID"}
FE            ─▶ routes /account/orders/{id}?payment=success + gets email (ARQ job)
```

## 4. Webhook Handling (`POST /api/webhooks/razorpay`)

- Razorpay configured with secret `RAZORPAY_WEBHOOK_SECRET`; event arrives with
  header `X-Razorpay-Signature`.
- Verify: `hmac_sha256(raw_body_bytes, secret) == signature` (constant-time
  compare). **Reject before parsing** if mismatch → 400.
- Handled events (idempotent by `provider_payment_id` + current DB status):

| Event | Action |
|---|---|
| `payment.captured` | payment.status=CAPTURED; if order PENDING → PAID (same txn; coupon usage already applied at start; never double-decrement stock); email job |
| `payment.failed` | payment.status=FAILED (order stays PENDING until TTL or user retries; retry allowed → admin/user-facing) |
| `refund.processed` | payment kind=REFUND row; order → REFUNDED (or partial: keep PAID, set refund_amount); restore stock if pre-shipment |
| `order.paid` (rare) | no double work (idempotency) |

- Always `200` after verified, even for no-op duplicates (prevents retry storms);
  `400` only on signature failure; `500` if our DB write fails (Razorpay retries).
- Order of handler: **verify auth → idempotency check → transaction → ack**.

## 5. Verification endpoints detail

- `POST /api/checkout/verify` recomputes
  `hmac_sha256(f"{order_id}|{payment_id}", KEY_SECRET)` and compares to the
  client-supplied signature — a cheap extra validation only; the webhook
  remains the source of truth (protects against lost webhooks).
- `checkout/start` is idempotent via `Idempotency-Key` (Redis SETNX 15m) — a
  fresh start with the same key returns the same order instead of a duplicate.

## 6. Refunds (admin)

```
PATCH /api/admin/orders/{id}/refund {amount, reason}
  → validate: order PAID, amount ≤ total − refunded
  → Razorpay POST /payments/{provider_payment_id}/refund {amount}
  → on success: payments row(REFUND), refund_amount += , order status
```
Refund failures surface as admin-raised `VALIDATION` with provider message;
the reconcile job re-checks older pending refunds.

## 7. Reconciliation Job (cron: every 15 min)

For each PENDING/PAID order with missing gateway state older than 5 min:
1. `GET /payments/{provider_order_id|payment_id}` from Razorpay (server-to-server)
2. Align DB payment/order state **in our direction of authority**:
   - gateway captured & DB PENDING → replicate capture path
   - gateway created & expired → cancel + release reservation
3. Alert (Sentry + email) on persistent mismatches.

Purpose: webhooks are lost in the wild; this closes the loop.

## 8. Money & Currency

- All amounts **INT paise**; Razorpay `amount` is paise too (perfect match).
- Currency fixed per deployment (`INR` default); changing to USD later requires
  a migration plan — flagged in doc 03.
- Rounding policy: never-per-item rounding; totals = sum(line_total) → coupon
  floor with remainder absorbed into discount; shipping/tax from settings.

## 9. Failure Matrix

| Failure | Experience |
|---|---|
| Razorpay API down at start | 503 + friendly FE banner; no order created |
| Payment modal closed | order stays PENDING; "Complete payment" link on order page; TTL releases stock in 15 min |
| Webhook lost | verify-client call covers it; reconcile job catches both events |
| Capture after TTL expiry | reconcile never cancels without confirming non-capture with Razorpay first; capture is always checked before release |
| Duplicate webhook | idempotent, 200 |
