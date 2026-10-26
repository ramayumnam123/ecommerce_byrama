"""JWT + password security primitives.

- Passwords: argon2id (m=64 MiB, t=3, p=1 per docs/05).
- Access tokens: JWT HS256, 15 min, claims {sub, role, email_verified, jti}.
- Single-use tokens (verify-email, reset-password, refresh): random 256-bit,
  stored SHA-256 hashed (never raw), each with its own TTL/purpose row.
"""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error
from jwt import InvalidAudienceError, InvalidIssuerError, InvalidTokenError, PyJWTError

from app.core.config import get_settings
from app.core.exceptions import AppError

settings = get_settings()

ISSUER = "ecommerce-api"
AUDIENCE = "ecommerce-web"

_password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=1)
# Precomputed for constant-time comparison when the email/user is unknown.
_DUMMY_HASH = _password_hasher.hash("dummy-password-for-timing")


# ---------------------------------------------------------------- passwords
def hash_password(plain: str) -> str:
    return _password_hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """True unless argon2 says the hash/password mismatch."""
    try:
        return _password_hasher.verify(hashed, plain)
    except Argon2Error:
        return False


def verify_password_or_dummy(plain: str, hashed: str | None) -> bool:
    """Run a dummy verify when no hash exists (anti-enumeration timing)."""
    if not hashed:
        try:
            _password_hasher.verify(_DUMMY_HASH, plain)
        except Argon2Error:
            return False
        return True
    return verify_password(plain, hashed)


def validate_password_policy(plain: str) -> None:
    if len(plain.encode("utf-8")) > 72:
        raise AppError("VALIDATION", "Password is too long", 400)
    if len(plain) < 8 or not any(c.isupper() for c in plain) or not any(c.isdigit() for c in plain):
        raise AppError(
            "VALIDATION",
            "Password needs at least 8 characters, 1 uppercase and 1 digit",
            400,
        )


# ---------------------------------------------------------------- hashing helpers
def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


# ---------------------------------------------------------------- JWT
@dataclass(frozen=True)
class TokenPayload:
    sub: str
    role: str
    email_verified: bool
    jti: str
    exp: int


def create_access_token(
    *, user_id: str, role: str, email_verified: bool, expires_min: int | None = None
) -> str:
    now = datetime.now(timezone.utc)
    ttl = expires_min or settings.jwt_expires_min
    claims = {
        "sub": user_id,
        "role": role,
        "email_verified": email_verified,
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": now,
        "exp": now + timedelta(minutes=ttl),
        "jti": uuid.uuid4().hex,
        "typ": "access",
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> TokenPayload:
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer=ISSUER,
            audience=AUDIENCE,
        )
    except jwt.ExpiredSignatureError:
        raise AppError("TOKEN_EXPIRED", "Session expired", 401) from None
    except InvalidIssuerError:
        raise AppError("AUTH_REQUIRED", "Invalid token issuer", 401) from None
    except InvalidAudienceError:
        raise AppError("AUTH_REQUIRED", "Invalid token audience", 401) from None
    except PyJWTError:
        raise AppError("AUTH_REQUIRED", "Invalid token", 401) from None
    if claims.get("typ") != "access":
        raise AppError("AUTH_REQUIRED", "Invalid token type", 401)
    return TokenPayload(
        sub=str(claims["sub"]),
        role=str(claims.get("role", "")),
        email_verified=bool(claims.get("email_verified", False)),
        jti=str(claims.get("jti", "")),
        exp=int(claims["exp"]),
    )


def raises_token_error(err: type[Exception]) -> bool:  # pragma: no cover - typing aid
    return issubclass(err, InvalidTokenError)
