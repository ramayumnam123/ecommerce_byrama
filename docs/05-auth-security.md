# 05 — Auth & Security

## 1. Identity Model

- Roles: `CUSTOMER` (default), `ADMIN`. Not extendable in v1 (groups/permissions later).
- Email is the login identifier, stored CITEXT-style (lower comparison) —
  `User@test.com` and `user@test.com` are the same account.

## 2. Access Tokens (JWT HS256)

| Claim | Meaning |
|---|---|
| `sub` | user id (UUID) |
| `role` | CUSTOMER / ADMIN |
| `iat`, `exp`, `iss:"ecommerce-api"`, `aud:"ecommerce-web"`, `jti` | standard |
| `email_verified` bool | cached snapshot for middleware UX |

- TTL **15 min**, HS256, secret `JWT_SECRET` (≥ 32 random bytes, shared with
  Next.js middleware — documented rationale: it lets the edge middleware reject
  expired/invalid users without calling the API; role checks remain server-side).
- Rotated periodically; rotation = change secret + rolling deploy.
- **No state in tokens beyond the above** — anything queryable lives in DB.

## 3. Refresh Tokens

- 256-bit random, returned **only** as httpOnly+Secure+SameSite=Lax cookie,
  Path=/api/auth (invisible to JS, CSRF-neutral by design for same-origin).
- Stored **SHA-256 hashed** in `refresh_tokens`; single-use:
  on `refresh`, old row is `revoked_at`+replaced ("rotation"), and any attempt
  to re-use a revoked token revokes the whole token family (reuse detection).
- TTL 7 days; absolute max lifetime 30 days from family root.
- Logout → revoke presented token. `POST /auth/forgot-password` → reset →
  revoke all user's refresh tokens.

## 4. Flows

```
signup:  argon2id hash → insert user → send verify email (ARQ)
         → issue access+refresh (auto-login, but unverified gets read-only)
verify:  signed token (itsdangerous-style, 48h TTL, single-use via hash) → set email_verified_at
login:   argon2 verify (constant-time; even on unknown email we run a dummy hash)
         → rate-limited → new token pair + cookie
refresh: cookie → hash → find row unrevoked+not-expired → rotate (revoke old,
         create new) → new access token (re-checks user `is_active`)
reset:   forgot → email w/ token (1h, single-use) → reset → revoke all refresh
```

## 5. Server-Side Authorization

```python
# core/deps.py
def require_roles(*roles):  # dependency factory
    async def dep(user: User = Depends(get_current_user)):
        if user.role not in roles: raise FORBIDDEN
        return user
    return dep

# routers/admin/*  →  dependencies=[Depends(require_roles(Role.ADMIN))]
```

- `get_current_user` verifies JWT, loads user, rejects `is_active=false`.
- Applies to **every** admin route; no exceptions.
- Ownership check: users can only read own orders/addresses (id from token,
  never from query).
- Webhook auth = Razorpay signature (doc 06) — not JWT.

## 6. Frontend Guards (UX layer only)

```ts
// middleware.ts (edge runtime)
import { jwtVerify } from "jose";
const { pathname } = req.nextUrl;
const protectedRoots = { "/admin": ["ADMIN"], "/account": ["CUSTOMER","ADMIN"] };
const token = req.cookies.get("access_token")?.value;
// verify → redirect /signin?next=… on missing/expired; role mismatch → /account
```

Admin data additionally shows `<RequireRole>` wrapper (renders nothing until
`GET /me` returns ADMIN) — but the API never trusts the client.

## 7. Validation & Input Safety

- Pydantic v2 with **strict where it matters** (ids must be UUID; money ints).
- No raw string SQL anywhere; SQLAlchemy bound params (injection-safe).
- File uploads: content-type allowlist + 5 MB cap + magic-byte sniff (Pillow),
  stored under ` GEN_RANDOM_UUID` key; never served same-origin.
- Coupon/admin inputs trimmed; slug unique-check; ENUMs via Python `enum.Enum`.
- Zod mirrors critical shapes on the FE (cart, checkout, signup).

## 8. Rate Limiting & Abuse

Redis token buckets per (route-class, identity IP or user id); see doc 04 §10.
Login additionally: exponential per-account counter (e.g. after 10 fails →
15 min lockout, email the user "we noticed…"). `X-Request-ID` passthrough.

## 9. Security Checklist (enforced at ship)

- [x] HTTPS only (HSTS `max-age=31536000; includeSubDomains`)
- [x] `SameSite=Lax` cookies, JWT in cookie-less header on XHR (no cross-site POST)
- [x] CSRF: token-based Authorization (XSS-tracked) + SameSite=Lax refresh cookie;
      state-changing routes require Authorization header (fetch wrapper does)
- [x] Security headers (Next.js): CSP (self + Razorpay checkout js + R2 images),
      X-Content-Type-Options, Referrer-Policy, X-Frame-Options DENY
- [x] CORS: exact origin allowlist, no `*` in prod
- [x] Secrets: env-only; `.env.example` documents names, no values
- [x] Passwords argon2id (m=64MB, t=3, p=1) — hash+constant-time verify
- [x] No email/ID enumeration (uniform 200 responses + same-timing dummy hashes)
- [x] Validation of all Razorpay webhook/payment signatures (docs 06)
- [x] Logging: request ids, PII (email/phone) masked; secrets never logged
- [x] Dependencies: `pip-audit` + `npm audit` in CI; Dependabot weekly
- [x] Admin actions audit-logged (actor, diff, ip, request_id)
- [x] DB least-privilege user (DML only; DDL via Alembic role in migrations job)
- [x] Backups: daily full + WAL archiving (doc 09), tested restore quarterly

## 10. Threat Model (top risks → mitigations)

| Threat | Mitigation |
|---|---|
| Credential stuffing | rate limits + account lockout + argon2 cost |
| Token theft (XSS) | httpOnly refresh, no tokens in localStorage, CSP |
| Replayed webhook | HMAC verify + idempotent handler + unique provider ids |
| Overselling during flash sale | row locks + short reservation TTL |
| Price tampering | totals computed server-side only; client amounts advisory |
| Privilege escalation | server-side role checks; can't self-demote admin |
| Enumeration via reset | uniform responses, hashed single-use tokens |
| Scraping catalog | rate limits + robots.txt; low business risk |
