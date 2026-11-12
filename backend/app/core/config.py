"""Application settings loaded from environment / .env (see .env.example)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["local", "staging", "prod"] = "local"
    debug: bool = True
    log_level: str = "INFO"

    # --- database ---
    database_url: str = "postgresql://postgres:postgres@localhost:5432/ecommerce"
    db_echo: bool = False

    # --- cache / queue ---
    redis_url: str = "redis://localhost:6379/0"

    # --- auth ---
    jwt_secret: str = "dev-secret-change-me-0123456789abcdef0123456789abcdef"
    jwt_expires_min: int = Field(default=15, ge=1, le=60)
    refresh_expires_days: int = Field(default=7, ge=1, le=30)
    verify_email_ttl_hours: int = 48
    reset_password_ttl_hours: int = 1

    # --- frontend ---
    frontend_origin: str = "http://localhost:3000"

    # --- payments (Razorpay) ---
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    # --- emails ---
    resend_api_key: str = ""
    email_from: str = "E-Commerce <orders@example.com>"

    # --- media (docs/04 §8; local mock until R2/S3 keys are configured) ---
    media_dir: str = "uploads"
    max_upload_mb: int = Field(default=5, ge=1, le=50)

    # --- background loops (ARQ replacement in this deployment) ---
    reservation_sweep_seconds: int = Field(default=60, ge=5, le=3600)


    # --- store defaults (paise / minor units) ---
    currency: str = "INR"
    flat_shipping_fee: int = 9900
    free_shipping_threshold: int = 99900
    tax_percent: int = 0

    # --- seeds ---
    seed_admin_email: str = ""
    seed_admin_password: str = ""

    @field_validator("log_level")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.upper()

    @model_validator(mode="after")
    def _prod_guard(self) -> "Settings":
        if self.environment == "prod":
            if self.debug:
                raise ValueError("DEBUG must be false when ENVIRONMENT=prod")
            if len(self.jwt_secret) < 32 or self.jwt_secret.startswith("dev-secret"):
                raise ValueError("JWT_SECRET must be a strong, unique secret in prod")
            if not self.razorpay_key_id.startswith("rzp_live_"):
                raise ValueError("Live Razorpay keys are required when ENVIRONMENT=prod")
        return self

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.frontend_origin.split(",") if o.strip()]

    @property
    def async_database_url(self) -> str:
        """Normalize scheme to the asyncpg driver."""
        url = self.database_url
        if url.startswith("postgresql+asyncpg://"):
            return url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            return "postgresql+asyncpg://" + url[len("postgresql://"):]
        raise ValueError(f"Unsupported DATABASE_URL scheme: {url!r}")

    @property
    def cookie_secure(self) -> bool:
        return self.environment in ("staging", "prod")

    @property
    def refresh_ttl_seconds(self) -> int:
        return self.refresh_expires_days * 24 * 60 * 60


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
