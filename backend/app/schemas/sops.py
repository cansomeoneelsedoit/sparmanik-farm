from pydantic import BaseModel
from datetime import datetime


class SopBase(BaseModel):
    title: str
    category: str
    description: str = ""
    steps: list[str] = []
    safety_notes: str = ""
    frequency: str = ""
    image_url: str = ""


class SopCreate(SopBase):
    pass


class SopOut(SopBase):
    id: int
    title_key: str
    version: int
    archived: bool
    archived_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class AiGenerateRequest(BaseModel):
    title: str
    category: str
    bullets: str
    lang: str = "en"


class AiGenerateResponse(BaseModel):
    description: str
    steps: list[str]
    safety_notes: str
    frequency: str
