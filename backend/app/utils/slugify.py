"""Slug helpers (docs/03 §2: products/categories slug UNIQUE)."""

import re
import uuid


def slugify(value: str, *, max_length: int = 200) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9\s-]", "", value)
    value = re.sub(r"[\s_-]+", "-", value).strip("-")
    if not value:
        return uuid.uuid4().hex[:12]
    if len(value) > max_length:
        # truncation may cut a word in half — drop the partial segment
        value = value[:max_length].rsplit("-", 1)[0]
    return value or uuid.uuid4().hex[:12]


async def unique_slug(db, model, base: str, *, max_length: int = 200) -> str:
    """Append -2, -3… until the slug is free (checked against the given model)."""
    base = slugify(base, max_length=max_length)
    from sqlalchemy import select

    candidate = base
    n = 1
    while True:
        exists = await db.scalar(
            select(model.id).where(model.slug == candidate)  # type: ignore[attr-defined]
        )
        if not exists:
            return candidate
        n += 1
        candidate = f"{base}-{n}"[:max_length]
