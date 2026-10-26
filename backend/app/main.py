"""FastAPI application factory (docs/02)."""

import sys
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

# Allow both `python -m app.main` and `python app/main.py` from any directory:
# put `backend/` (the parent of this package) on sys.path so `import app.*`
# resolves no matter what the current working directory is.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.core import ratelimit
from app.core.config import get_settings
from app.core.exceptions import register_error_handlers
from app.core.logging import bind_request_id, configure_logging, get_logger, request_id_var
from app.db.session import engine
from app.routers import API_PREFIX
from app.routers import (
    addresses,
    admin,
    auth,
    cart,
    catalog,
    checkout,
    health,
    media,
    orders,
    webhooks,
)

logger = get_logger()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    from app.services import reservation_sweeper

    sweep_task = asyncio.create_task(
        reservation_sweeper.sweep_loop(settings.reservation_sweep_seconds)
    )
    try:
        yield
    finally:
        sweep_task.cancel()
        await engine.dispose()


def create_app() -> FastAPI:
    configure_logging(settings.log_level, environment=settings.environment)

    app = FastAPI(
        title="E-Commerce API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # --- middleware ---
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=True,  # refresh cookie
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):  # noqa: ANN202
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:32]
        bind_request_id(rid)
        start = time.perf_counter()

        limited = ratelimit.enforce(request)
        if limited is not None:  # docs/04 §10: 429 + Retry-After, standard envelope
            return JSONResponse(
                status_code=429,
                content=limited.to_body(),
                headers={"Retry-After": str(limited.retry_after), "X-Request-ID": rid},
            )

        try:
            response: Response = await call_next(request)
        except Exception:
            logger.bind(path=request.url.path, method=request.method).error(
                "request_failed", request_id=request_id_var.get()
            )
            raise
        else:
            _apply_security_headers(response)
            response.headers["X-Request-ID"] = rid
            logger.bind(
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                ms=round((time.perf_counter() - start) * 1000, 1),
            ).info("request")
            return response
        finally:
            request_id_var.set("-")

    def _apply_security_headers(response: Response) -> None:  # noqa: ANN202
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        if settings.environment in ("staging", "prod"):
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )

    register_error_handlers(app)

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(catalog.router)
    app.include_router(cart.router)
    app.include_router(addresses.router)
    app.include_router(checkout.router)
    app.include_router(orders.router)
    app.include_router(webhooks.router)
    app.include_router(admin.router)
    app.include_router(media.router)

    @app.get(f"{API_PREFIX}")
    async def root() -> dict:
        return {"name": "E-Commerce API", "docs": "/docs", "version": app.version}

    return app


app = create_app()


if __name__ == "__main__":  # pragma: no cover - manual dev entry point
    import os

    import uvicorn

    # `uvicorn.run` is given an import string so `--reload` works on Windows too.
    reload_enabled = os.getenv(
        "RELOAD", "1" if settings.environment == "local" else "0"
    ).lower() in ("1", "true", "yes")

    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=reload_enabled,
        log_level=settings.log_level.lower(),
    )
