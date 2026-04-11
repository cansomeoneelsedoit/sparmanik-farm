from pydantic import BaseModel, EmailStr
from datetime import datetime


class UserRegister(BaseModel):
    email: EmailStr
    name: str
    password: str
    language: str = "en"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    permissions: list[str]
    language: str
    created_at: datetime

    class Config:
        from_attributes = True


class RefreshRequest(BaseModel):
    refresh_token: str


class UpdateLanguageRequest(BaseModel):
    language: str
