"""Media uploads (docs/04 §8): presign → PUT bytes → public GET → ref-guarded
DELETE.

Like the Razorpay integration this has an explicit mock mode: with no S3/R2
configured (`media_backend="local"`), uploads land on the API host's filesystem
under `MEDIA_DIR`. Real Cloudflare R2/S3 keys plug into the same contract
(`presign` swaps in a real PUT URL; `serve` swaps in the public CDN url).
"""

import uuid
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.models import ProductImage

settings = get_settings()

CONTENT_TYPE_EXTS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

_EXT_TYPES = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

_MAGIC_PREFIXES = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
)


def media_root() -> Path:
    root = Path(settings.media_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _ext_from(filename: str, content_type: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in {".jpg", ".jpeg", ".png", ".webp"}:
        return ".jpg" if ext == ".jpeg" else ext
    return CONTENT_TYPE_EXTS.get(content_type, ".jpg")


def presign(filename: str, content_type: str) -> dict:
    """spec §8: `{upload_url, public_url}`; allowlist + 5 MB cap."""
    if content_type not in CONTENT_TYPE_EXTS:
        raise ValidationAppError(
            "VALIDATION",
            "content_type must be one of image/jpeg, image/png, image/webp",
            details={"allowed": sorted(CONTENT_TYPE_EXTS)},
        )
    key = f"media-{uuid.uuid4().hex}{_ext_from(filename, content_type)}"
    upload_url = f"/api/media/local/{key}"
    public_url = f"/api/media/{key}"
    return {"key": key, "upload_url": upload_url, "public_url": public_url,
            "max_bytes": settings.max_upload_mb * 1024 * 1024}


def _sniff(data: bytes) -> str:
    for prefix, content_type in _MAGIC_PREFIXES:
        if data.startswith(prefix):
            return content_type
    if len(data) > 12 and data[0:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    raise ValidationAppError("VALIDATION", "File content is not a valid JPEG/PNG/WebP image")


async def save_upload(key: str, data: bytes) -> dict:
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise ValidationAppError(
            "VALIDATION", f"Files are capped at {settings.max_upload_mb} MB"
        )
    if Path(key).name != key or "\\" in key or "/" in key or not key.startswith("media-"):
        # presign hands out keys like `media-<hex>.<ext>`; anything else is rejected
        raise ValidationAppError("VALIDATION", "Malformed media key")
    content_type = _sniff(data)
    if content_type != _EXT_TYPES[Path(key).suffix]:
        raise ValidationAppError("VALIDATION", "File bytes do not match the declared key type")
    target = media_root() / key
    target.write_bytes(data)
    return {"key": key, "public_url": f"/api/media/{key}", "bytes": len(data)}


def serve_path(key: str) -> tuple[Path, str]:
    if Path(key).name != key or not key.startswith("media-") or "." not in key:
        raise NotFoundError()
    target = media_root() / key
    if not target.is_file():
        raise NotFoundError()
    content_type = _EXT_TYPES.get(target.suffix, "application/octet-stream")
    return target, content_type


async def delete_media(db: AsyncSession, key: str) -> None:
    """Ref-count check first (spec §8: soft delete/ref-count check)."""
    if Path(key).name != key:
        raise NotFoundError()
    public_url = f"/api/media/{key}"
    refs = int(
        await db.scalar(
            select(func.count()).select_from(ProductImage).where(ProductImage.url == public_url)
        ) or 0
    )
    if refs:
        raise ConflictError(
            "MEDIA_IN_USE", f"'{key}' is attached to {refs} product image(s) — remove them first"
        )
    target = media_root() / key
    if not target.is_file():
        raise NotFoundError()
    target.unlink()
