"""In-process fixed-window rate limiter (docs/04 §10).

Per key  -> 429 RATE_LIMITED + Retry-After.

Redis-swap point: everything routes through `_hit()`. Today it keeps a
process-local `{key: (window_end, count)}` dict (no Redis installed in this
deployment); a Redis backend only re-implements `_hit` as INCR + PEXPIRE.

Limits (docs/04 §10):
  auth signup/login/resend/forgot  5/min  per IP
  catalog GET                     120/min  per IP
  cart mutating                    60/min  per identity (user | guest | IP)
  checkout start/verify(+mock-pay) 10/min  per user
  admin writes                     60/min  per user
  webhooks / health               exempt (signature check)
  everything else                 120/min  per IP (sane global default)
"""

import threading
import time

from fastapi import Request

from app.core.exceptions import AppError

LIMITS: dict[str, tuple[int, int]] = {
    "auth": (5, 60),
    "catalog": (120, 60),
    "cart": (60, 60),
    "checkout": (10, 60),
    "admin_writes": (60, 60),
    "general": (120, 60),
}

# _buckets[key] = (window_started_at, hits)
_buckets: dict[str, tuple[float, int]] = {}
_lock = threading.Lock()

EXEMPT_PREFIXES = ("/api/webhooks/", "/api/healthz", "/api/readyz")


class RateLimitError(AppError):
    status_code = 429

    def __init__(self, retry_after: int) -> None:
        super().__init__(
            "RATE_LIMITED",
            "Too many requests — slow down",
            details={"retry_after": retry_after},
        )
        self.retry_after = retry_after


def _hit(key: str, limit: int, window_seconds: int) -> int:
    """Returns seconds until the key's window resets when over the limit."""
    now = time.monotonic()
    with _lock:
        if len(_buckets) > 10_000:  # cheap periodic prune of stale windows
            for stale in [k for k, (start, _) in _buckets.items() if now - start >= window_seconds + 1]:
                _buckets.pop(stale, None)
        started, count = _buckets.get(key, (now, 0))
        if now - started >= window_seconds:
            started, count = now, 0
        count += 1
        _buckets[key] = (started, count)
        if count > limit:
            return int(window_seconds - (now - started)) + 1
        return 0


def client_ip(request: Request) -> str:
    """Direct peer IP, or the CDN-plausible client behind X-Forwarded-For."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _identity(request: Request) -> str | None:
    """User id from a valid access token; else guest token; else None."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        from app.core.security import decode_access_token

        try:
            return decode_access_token(auth[7:]).sub
        except Exception:
            pass  # invalid/expired token → identity falls back; auth 401s later
    return request.headers.get("x-guest-token") or None


def resolve(request: Request) -> tuple[str, str, int] | None:
    """(family, bucket key, retry_after_limit_tuple_index) for this request."""
    path = request.url.path
    method = request.method
    if not path.startswith("/api/"):
        return None
    if any(path.startswith(p) or path.rstrip("/") == p.rstrip("/") for p in EXEMPT_PREFIXES):
        return None

    tail = path[len("/api"):]
    if method != "GET" and (
        tail.startswith("/auth/signup")
        or tail.startswith("/auth/login")
        or tail.startswith("/auth/resend-verification")
        or tail.startswith("/auth/forgot-password")
        or tail.startswith("/auth/reset-password")
    ):
        return "auth", client_ip(request), LIMITS["auth"][0]

    if method == "GET" and (tail.startswith("/products") or tail.startswith("/categories")):
        return "catalog", client_ip(request), LIMITS["catalog"][0]

    if method in ("POST", "PATCH", "DELETE", "PUT") and tail.startswith("/cart"):
        ident = _identity(request) or client_ip(request)
        return "cart", ident, LIMITS["cart"][0]

    if method == "POST" and (
        tail.startswith("/checkout/start")
        or tail.startswith("/checkout/verify")
        or tail.startswith("/checkout/mock-pay")
    ):
        ident = _identity(request) or client_ip(request)
        return "checkout", ident, LIMITS["checkout"][0]

    if method != "GET" and tail.startswith("/admin"):
        ident = _identity(request) or client_ip(request)
        return "admin_writes", ident, LIMITS["admin_writes"][0]

    if method in ("POST", "PATCH", "DELETE", "PUT"):
        return "general", client_ip(request), LIMITS["general"][0]
    return "general", client_ip(request), LIMITS["general"][0]


def enforce(request: Request) -> RateLimitError | None:
    """Returns RateLimitError when the caller is over their allowed rate."""
    rule = resolve(request)
    if rule is None:
        return None
    family, key, limit = rule
    window = LIMITS[family][1]
    retry = _hit(f"{family}:{key}", limit, window)
    if retry:
        return RateLimitError(retry)
    return None
