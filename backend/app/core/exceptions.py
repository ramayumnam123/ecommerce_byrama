"""Canonical error contract (docs/02 §4):

    {"error": {"code", "message", "details", "request_id"}}

Routers never raise raw HTTPException — always AppError subclasses.
"""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import request_id_var


class AppError(Exception):
    """Base for every raised error that becomes the public envelope."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "BAD_REQUEST"
    default_message = "Bad request"

    def __init__(
        self,
        code: str | None = None,
        message: str | None = None,
        details: dict[str, Any] | None = None,
        status_code: int | None = None,
    ) -> None:
        self.code = code or self.default_code
        self.message = message or self.default_message
        self.details = details
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.message)

    def to_body(self) -> dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details or {},
                "request_id": request_id_var.get(),
            }
        }


class AuthError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = "AUTH_REQUIRED"
    default_message = "Authentication required"


class ForbiddenError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "FORBIDDEN"
    default_message = "You do not have access to this resource"


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = "NOT_FOUND"
    default_message = "Resource not found"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "CONFLICT"
    default_message = "Conflicting state"


class ValidationAppError(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "VALIDATION"
    default_message = "Validation failed"


class InternalError(AppError):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    default_code = "INTERNAL"
    default_message = "Something went wrong. Try again or contact support."


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_body())

    @app.exception_handler(RequestValidationError)
    async def schema_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        def safe(err: dict) -> dict:
            out: dict = {}
            for key, value in err.items():
                if key == "ctx" and isinstance(value, dict):
                    out[key] = {k: str(v) for k, v in value.items()}
                elif key == "url":
                    out[key] = str(value)
                else:
                    out[key] = value
            return out

        body = AppError(
            "SCHEMA",
            "Request validation failed",
            details={"fields": [safe(e) for e in exc.errors()]},
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        ).to_body()
        return JSONResponse(status_code=422, content=body)

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:  # pragma: no cover
        import structlog

        structlog.get_logger().bind(exception=str(exc)).error("unhandled_exception")
        body = AppError("INTERNAL").to_body()
        return JSONResponse(status_code=500, content=body)
