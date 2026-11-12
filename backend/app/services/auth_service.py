"""Auth business logic: signup/login, refresh rotation + reuse detection,
verify-email, forgot/reset password (docs/05 §4)."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Response
from sqlalchemy import select, update

from app.core.config import get_settings
from app.core.exceptions import AppError, AuthError, ConflictError, ValidationAppError
from app.core.security import (
    create_access_token,
    hash_password,
    new_token,
    sha256_hex,
    validate_password_policy,
    verify_password_or_dummy,
)
from app.models import RefreshToken, TokenPurpose, User
from app.schemas.auth_schemas import LoginIn, SignupIn
from app.services.email_service import send_email

settings = get_settings()

REFRESH_COOKIE = "refresh_token"
_VERIFICATION_HTML = """<p>Hi {name},</p>
<p>Verify your e-commerce account: <a href="{frontend}/verify-email?token={token}">Verify email</a></p>
<p>This link expires in {hours} hours.</p>"""
_RESET_HTML = """<p>Hi {name},</p>
<p>Reset your password: <a href="{frontend}/reset-password?token={token}">Reset password</a></p>
<p>This link expires in {minutes} minutes.</p>"""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _frontend_base() -> str:
    return settings.origins[0] if settings.origins else "http://localhost:3000"


def set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=raw_token,
        max_age=settings.refresh_ttl_seconds,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api/auth",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE, path="/api/auth")


# ------------------------------------------------------------------ session
async def _issue_session(db, *, user: User, rotated_from: uuid.UUID | None = None) -> str:
    """Creates a refresh-token row (hashed) and returns the raw token."""
    raw = new_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            purpose=TokenPurpose.REFRESH,
            token_hash=sha256_hex(raw),
            expires_at=_now() + timedelta(days=settings.refresh_expires_days),
            rotated_from=rotated_from,
        )
    )
    await db.flush()
    return raw


async def _issue_action_token(
    db, *, user: User, purpose: TokenPurpose, ttl: timedelta
) -> str:
    raw = new_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=sha256_hex(raw),
            expires_at=_now() + ttl,
        )
    )
    await db.flush()
    return raw


async def _load_user_by_id(db, user_id: uuid.UUID) -> User:
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        raise AuthError("AUTH_REQUIRED", "Account not found or disabled", 401)
    return user


# ------------------------------------------------------------------ signup/login
async def signup(db, data: SignupIn) -> User:
    email = data.email.strip().lower()
    validate_password_policy(data.password)
    exists = await db.scalar(select(User.id).where(User.email == email))
    if exists:
        raise ConflictError("EMAIL_TAKEN", "This email is already registered")

    user = User(
        email=email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name.strip(),
    )
    db.add(user)
    await db.flush()

    raw = await _issue_action_token(
        db,
        user=user,
        purpose=TokenPurpose.VERIFY_EMAIL,
        ttl=timedelta(hours=settings.verify_email_ttl_hours),
    )
    await send_email(
        to=user.email,
        subject="Verify your email",
        html=_VERIFICATION_HTML.format(
            name=user.full_name, token=raw, frontend=_frontend_base(), hours=settings.verify_email_ttl_hours
        ),
    )
    return user


async def login(db, data: LoginIn) -> User:
    email = data.email.strip().lower()
    user = await db.scalar(select(User).where(User.email == email))
    if not verify_password_or_dummy(data.password, user.hashed_password if user else None):
        # constant-time-ish path; unknown email also ran a dummy verify
        raise AuthError("AUTH_REQUIRED", "Invalid email or password", 401)
    assert user is not None
    if not user.is_active:
        raise AuthError("AUTH_REQUIRED", "Account is disabled", 401)
    return user


# ------------------------------------------------------------------ refresh/logout
async def rotate_refresh(db, response: Response, raw_token: str) -> tuple[User, str]:
    """Rotate the presented refresh token. Reuse of a revoked token revokes
    the whole user's refresh family (docs/05 §3)."""
    row = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == sha256_hex(raw_token))
    )
    if row is None:
        raise AuthError("REFRESH_INVALID", "Invalid refresh token", 401)
    if row.purpose != TokenPurpose.REFRESH:
        raise AuthError("REFRESH_INVALID", "Invalid token kind", 401)
    if row.revoked_at is not None:
        # token reuse → burn the whole refresh family.
        # NOTE: explicit commit — the request is about to raise, and the
        # commit-on-success dependency would otherwise roll this back.
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == row.user_id, RefreshToken.purpose == TokenPurpose.REFRESH)
            .values(revoked_at=_now())
        )
        await db.commit()
        raise AuthError("REFRESH_INVALID", "Session revoked", 401)
    if row.expires_at <= _now():
        raise AuthError("REFRESH_INVALID", "Refresh token expired", 401)

    user = await _load_user_by_id(db, row.user_id)
    row.revoked_at = _now()
    new_raw = await _issue_session(db, user=user, rotated_from=row.id)
    return user, new_raw


async def revoke_refresh(db, raw_token: str | None) -> None:
    if not raw_token:
        return
    row = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == sha256_hex(raw_token))
    )
    if row and row.revoked_at is None:
        row.revoked_at = _now()


# ------------------------------------------------------------------ email verify
async def verify_email(db, token: str) -> User:
    row = await _redeem_action_token(db, token, TokenPurpose.VERIFY_EMAIL)
    user = await _load_user_by_id(db, row.user_id)
    if user.email_verified_at is None:
        user.email_verified_at = _now()
    return user


async def resend_verification(db, email: str) -> None:
    """Always succeeds (silent when unknown/unverified) — no enumeration."""
    user = await db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or user.is_active is False:
        return
    if user.email_verified_at is not None:
        return
    raw = await _issue_action_token(
        db,
        user=user,
        purpose=TokenPurpose.VERIFY_EMAIL,
        ttl=timedelta(hours=settings.verify_email_ttl_hours),
    )
    await send_email(
        to=user.email,
        subject="Verify your email",
        html=_VERIFICATION_HTML.format(
            name=user.full_name, token=raw, frontend=_frontend_base(), hours=settings.verify_email_ttl_hours
        ),
    )


# ------------------------------------------------------------------ reset flow
async def forgot_password(db, email: str) -> None:
    """Always succeeds silently (docs/05: no user enumeration)."""
    user = await db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or not user.is_active:
        return
    raw = await _issue_action_token(
        db,
        user=user,
        purpose=TokenPurpose.RESET_PASSWORD,
        ttl=timedelta(minutes=60),
    )
    await send_email(
        to=user.email,
        subject="Reset your password",
        html=_RESET_HTML.format(name=user.full_name, token=raw, frontend=_frontend_base(), minutes=60),
    )


async def reset_password(db, token: str, new_password: str) -> None:
    validate_password_policy(new_password)
    row = await _redeem_action_token(db, token, TokenPurpose.RESET_PASSWORD)
    user = await _load_user_by_id(db, row.user_id)
    user.hashed_password = hash_password(new_password)
    # password rotation invalidates existing sessions
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.purpose == TokenPurpose.REFRESH)
        .values(revoked_at=_now())
    )


async def _redeem_action_token(db, raw_token: str, purpose: TokenPurpose) -> RefreshToken:
    row = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == sha256_hex(raw_token), RefreshToken.purpose == purpose
        )
    )
    if row is None or row.revoked_at is not None:
        raise ValidationAppError("VALIDATION", "Invalid or expired link")
    if row.expires_at <= _now():
        raise ValidationAppError("VALIDATION", "Invalid or expired link")
    row.revoked_at = _now()
    return row
