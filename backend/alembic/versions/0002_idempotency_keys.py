"""0002: idempotency_keys (checkout Idempotency-Key, docs/06 §5).

Targeted table create (same create_all-style approach as 0001) — safe additive
on the existing DB.
"""

from alembic import op

from app import models  # noqa: F401  (register mappers)
from app.db.base import Base

revision = "0002_idempotency_keys"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.tables["idempotency_keys"].create(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.tables["idempotency_keys"].drop(bind=op.get_bind())
