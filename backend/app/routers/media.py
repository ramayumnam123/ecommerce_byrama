"""Media routes (docs/04 §8): presign (ADMIN) → local PUT (ADMIN; mock/local
backend until R2 keys exist) → public GET → ref-guarded DELETE (ADMIN).
Mutations are audit-logged like every other admin write."""

from fastapi import (APIRouter, Body, Path, Request, Response, status)
from fastapi.responses import FileResponse

from app.core.deps import AdminDep, DbDep
from app.routers import API_PREFIX
from app.schemas.admin_schemas import MediaPresignIn
from app.services import media_service
from app.services.audit_service import audit

router = APIRouter(prefix=f"{API_PREFIX}/media", tags=["media"])

KEY_PARAM = Path(min_length=10, max_length=80)


@router.post("/presign", status_code=status.HTTP_201_CREATED)
async def presign_media(
    body: MediaPresignIn,
    request: Request,
    user: AdminDep,
    db: DbDep,
) -> dict:
    out = media_service.presign(filename=body.filename, content_type=body.content_type)
    await audit(db, actor=user, action="media.presign", entity_type="media",
                entity_id=None, diff={"key": out["key"]}, request=request)
    return out


@router.put("/local/{key}", status_code=status.HTTP_201_CREATED)
async def upload_local_media(
    request: Request,
    key: str = KEY_PARAM,
    data: bytes = Body(..., media_type="application/octet-stream"),
    user: AdminDep = None,  # type: ignore[assignment,arg-type]  # noqa: ARG001 - role gate
) -> dict:
    return await media_service.save_upload(key, data)


@router.get("/{key}")
async def serve_media(key: str = KEY_PARAM) -> FileResponse:
    target, content_type = media_service.serve_path(key)
    return FileResponse(target, media_type=content_type)


@router.delete("/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    key: str = KEY_PARAM,
    request: Request = None,  # type: ignore[assignment]
    user: AdminDep = None,  # type: ignore[assignment,arg-type]
    db: DbDep = None,  # type: ignore[assignment,arg-type]
) -> Response:
    await media_service.delete_media(db, key)
    await audit(db, actor=user, action="media.delete", entity_type="media",
                entity_id=None, diff={"key": key}, request=request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
