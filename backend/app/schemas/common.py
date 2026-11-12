import uuid
from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(ORMModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    email_verified: bool = False
    created_at: datetime
    updated_at: datetime


class TokenPairOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class MessageOut(BaseModel):
    message: str


class ErrorOut(BaseModel):
    code: str
    message: str
    details: dict = Field(default_factory=dict)
    request_id: str = "-"
