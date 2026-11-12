"""Alembic async environment, DSN taken from app settings (docs/03 §5)."""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool

from app import models  # noqa: F401  (register all mappers)
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

configure_logging("INFO")
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().async_database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_migrations_sync(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def _run_async_migrations() -> None:
    from app.db.session import build_engine

    engine = build_engine(get_settings().async_database_url)
    async with engine.connect() as connection:
        await connection.run_sync(_run_migrations_sync)
    await engine.dispose()


def run_migrations_online() -> None:
    asyncio.run(_run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
