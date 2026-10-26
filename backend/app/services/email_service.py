"""Transactional email (Resend). Phase 1: logs. Phase 3: real sending via httpx."""

import structlog

from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


async def send_email(to: str, subject: str, html: str) -> bool:
    """Returns True when the email was actually enqueued/sent."""
    if not settings.resend_api_key:
        logger.info("email_stub", to=to, subject=subject)  # dev: visible in console
        return False

    import httpx

    try:
        resp = await httpx.AsyncClient(timeout=10).post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.email_from,
                "to": [to],
                "subject": subject,
                "html": html,
            },
        )
        resp.raise_for_status()
        return True
    except Exception as exc:  # pragma: no cover - network
        logger.bind(error=str(exc)).error("email_send_failed", to=to, subject=subject)
        return False
