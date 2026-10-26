"""Cross-cutting FastAPI dependencies: db session, auth, RBAC."""

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AuthError, ForbiddenError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User, UserRole

settings = get_settings()

DbDep = Annotated[AsyncSession, Depends(get_db)]


# Declared as a FastAPI security scheme so the "Authorize" button + bearer
# parameter appear in /docs and the OpenAPI schema. auto_error=False keeps the
# custom 401 envelope (docs/04) instead of FastAPI's default "Not authenticated".
_bearer = HTTPBearer(auto_error=False)


async def get_current_user(  # noqa: RUF029
    request: Request,
    db: DbDep,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User:
    token = credentials.credentials if credentials else ""
    if not credentials or not token:  # matches old missing/malformed header path
        raise AuthError()  # malformed header still falls through the decode below
    payload = decode_access_token(token)
    user = await db.scalar(select(User).where(User.id == payload.sub))
    if user is None or not user.is_active:
        raise AuthError("AUTH_REQUIRED", "Account not found or disabled", 401)
    return user


CurrentUserDep = Depends(get_current_user)
UserDep = Annotated[User, CurrentUserDep]


def require_roles(*roles: UserRole):
    """Dependency factory for route-level role checks (docs/05 §5)."""

    async def _dep(user: UserDep) -> User:
        if user.role not in roles:
            raise ForbiddenError()
        return user

    return _dep


AdminDep = Annotated[User, Depends(require_roles(UserRole.ADMIN))]
