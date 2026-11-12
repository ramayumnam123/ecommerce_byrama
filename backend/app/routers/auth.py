"""Auth endpoints (docs/04 §2). Refresh token is httpOnly cookie-based."""

from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select

from app.core.config import get_settings
from app.core.deps import DbDep, UserDep
from app.core.exceptions import AuthError
from app.core.security import create_access_token
from app.db.session import get_db
from app.models import RefreshToken, TokenPurpose, User
from app.routers import API_PREFIX
from app.schemas.auth_schemas import (
    ForgotPasswordIn,
    LoginIn,
    MeUpdateIn,
    ResetPasswordIn,
    ResendVerificationIn,
    SignupIn,
    VerifyEmailIn,
)
from app.schemas.common import MessageOut, TokenPairOut, UserOut
from app.services import auth_service

router = APIRouter(prefix=f"{API_PREFIX}/auth", tags=["auth"])
settings = get_settings()


def _token_pair(user: User, access_token: str) -> TokenPairOut:
    verified = user.email_verified_at is not None
    return TokenPairOut(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.jwt_expires_min * 60,
        user=UserOut(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=str(user.role.value),
            is_active=user.is_active,
            email_verified=verified,
            created_at=user.created_at,
            updated_at=user.updated_at,
        ),
    )


@router.post("/signup", response_model=TokenPairOut, status_code=201)
async def signup(body: SignupIn, db: DbDep, response: Response) -> TokenPairOut:
    user = await auth_service.signup(db, body)
    access = create_access_token(
        user_id=str(user.id), role=user.role.value, email_verified=False
    )
    raw = await auth_service._issue_session(db, user=user)  # noqa: SLF001 - module API
    auth_service.set_refresh_cookie(response, raw)
    return _token_pair(user, access)


@router.post("/login", response_model=TokenPairOut)
async def login(body: LoginIn, db: DbDep, response: Response) -> TokenPairOut:
    user = await auth_service.login(db, body)
    access = create_access_token(
        user_id=str(user.id),
        role=user.role.value,
        email_verified=user.email_verified_at is not None,
    )
    raw = await auth_service._issue_session(db, user=user)  # noqa: SLF001
    auth_service.set_refresh_cookie(response, raw)
    return _token_pair(user, access)


@router.post("/refresh", response_model=TokenPairOut)
async def refresh(request: Request, response: Response, db: DbDep) -> TokenPairOut:
    raw = request.cookies.get(auth_service.REFRESH_COOKIE)
    if not raw:
        raise AuthError("REFRESH_INVALID", "Missing refresh cookie", 401)
    user, new_raw = await auth_service.rotate_refresh(db, response, raw)
    access = create_access_token(
        user_id=str(user.id),
        role=user.role.value,
        email_verified=user.email_verified_at is not None,
    )
    auth_service.set_refresh_cookie(response, new_raw)
    return _token_pair(user, access)


@router.post("/logout", response_model=MessageOut)
async def logout(
    request: Request, response: Response, db: DbDep
) -> MessageOut:
    raw = request.cookies.get(auth_service.REFRESH_COOKIE)
    await auth_service.revoke_refresh(db, raw)
    auth_service.clear_refresh_cookie(response)
    return MessageOut(message="Logged out")


@router.get("/me", response_model=UserOut)
async def me(user: UserDep) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=str(user.role.value),
        is_active=user.is_active,
        email_verified=user.email_verified_at is not None,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.patch("/me", response_model=UserOut)
async def update_me(body: MeUpdateIn, user: UserDep, db: DbDep) -> UserOut:
    if body.full_name is not None:
        user.full_name = body.full_name
    await db.flush()
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=str(user.role.value),
        is_active=user.is_active,
        email_verified=user.email_verified_at is not None,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.post("/verify-email", response_model=MessageOut)
async def verify_email(body: VerifyEmailIn, db: DbDep) -> MessageOut:
    user = await auth_service.verify_email(db, body.token)
    return MessageOut(message="Email verified")


@router.post("/resend-verification", response_model=MessageOut)
async def resend_verification(body: ResendVerificationIn, db: DbDep) -> MessageOut:
    await auth_service.resend_verification(db, body.email)
    return MessageOut(message="If that email needs verification, a link was sent")


@router.post("/forgot-password", response_model=MessageOut)
async def forgot_password(body: ForgotPasswordIn, db: DbDep) -> MessageOut:
    await auth_service.forgot_password(db, body.email)
    return MessageOut(message="If that email exists, a reset link was sent")


@router.post("/reset-password", response_model=MessageOut)
async def reset_password(body: ResetPasswordIn, db: DbDep) -> MessageOut:
    await auth_service.reset_password(db, body.token, body.new_password)
    return MessageOut(message="Password updated. Please sign in again.")
