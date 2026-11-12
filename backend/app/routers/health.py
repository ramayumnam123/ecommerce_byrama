from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import engine

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict:
    """Liveness — no DB dependency (docs/04 §1)."""
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> dict:
    """Readiness — checks Postgres. Redis is checked best-effort."""
    checks: dict[str, str] = {}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
        db_ok = True
    except Exception as exc:  # pragma: no cover - env dependent
        checks["postgres"] = f"down: {type(exc).__name__}"
        db_ok = False

    redis_ok = None
    if await _redis_ping() is True:
        checks["redis"] = "ok"
        redis_ok = True
    else:
        checks["redis"] = "down (optional in local)"
        redis_ok = False

    return {"status": "ok" if db_ok else "unavailable", "checks": checks}


async def _redis_ping() -> bool:
    from app.core.config import get_settings

    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(get_settings().redis_url, socket_timeout=0.5)
        await client.ping()
        await client.aclose()
        return True
    except Exception:
        return False
