"""Async engine + sessionmaker + transaction-per-request dependency (docs/02 §8)."""

from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.db.base import Base


def build_engine(url: str, echo: bool = False) -> AsyncEngine:
    return create_async_engine(
        url,
        echo=echo,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )


_settings = get_settings()
engine: AsyncEngine = build_engine(_settings.async_database_url, echo=_settings.db_echo)

SessionLocal: async_sessionmaker = async_sessionmaker(
    engine, expire_on_commit=False, autoflush=False
)


async def get_db() -> AsyncIterator:  # pragma: no cover - skinny wrapper
    """One transaction per request: commit on success, rollback on error."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def create_all(engine_: AsyncEngine | None = None) -> None:  # pragma: no cover - utility
    import asyncio

    target = engine_ or engine
    asyncio.run(_create_all(target))


async def _create_all(target: AsyncEngine) -> None:
    from app import models  # noqa: F401  (register mappers)

    async with target.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
