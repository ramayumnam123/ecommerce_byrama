"""structlog setup + request-id context propagation (docs/02 §3)."""

import contextvars
import logging
from typing import Any

import structlog

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

_configured = False


def configure_logging(level: str = "INFO", *, environment: str = "local") -> None:
    """JSON logs in staging/prod, pretty console in local dev."""
    global _configured
    if _configured:
        return
    logging.basicConfig(format="%(message)s", level=level)
    for noisy in ("uvicorn.access", "uvicorn.error"):
        logging.getLogger(noisy).handlers = logging.getLogger().handlers
    renderer = (
        structlog.dev.ConsoleRenderer() if environment == "local" else structlog.processors.JSONRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    _configured = True


def bind_request_id(request_id: str) -> None:
    request_id_var.set(request_id)
    structlog.contextvars.bind_contextvars(request_id=request_id)


def get_logger(*args: Any, **kwargs: Any):
    return structlog.get_logger(*args, **kwargs)
