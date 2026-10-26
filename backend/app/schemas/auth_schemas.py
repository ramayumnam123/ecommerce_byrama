from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.common import UserOut


class SignupIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=1, max_length=120)


class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class AbstractActionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")


class VerifyEmailIn(AbstractActionIn):
    token: str = Field(min_length=16, max_length=400)


class ResendVerificationIn(AbstractActionIn):
    email: EmailStr


class ForgotPasswordIn(AbstractActionIn):
    email: EmailStr


class ResetPasswordIn(AbstractActionIn):
    token: str = Field(min_length=16, max_length=400)
    new_password: str = Field(min_length=8, max_length=72)


class MeUpdateIn(AbstractActionIn):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    # phone/mobile listing comes with addresses (phase: users router)


SignupOut = UserOut
