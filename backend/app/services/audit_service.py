"""Audit logging (docs/08 §1): every admin mutation lands in audit_logs."""

from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import request_id_var
from app.models import AuditLog, User


async def audit(
    db: AsyncSession,
    *,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: Any | None = None,
    diff: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    """Call inside the mutating request's session — commits with the request."""
    row = AuditLog(
        actor_user_id=actor.id if actor is not None else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        diff=diff or {},
        ip=request.client.host if request is not None and request.client else None,
        request_id=request_id_var.get() or None,
    )
    db.add(row)
    await db.flush()
