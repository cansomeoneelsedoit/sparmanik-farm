from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str  # user or assistant
    text: str


class ChatRequest(BaseModel):
    question: str
    history: list[ChatMessage] = []
    lang: str = "en"


class ChatResponse(BaseModel):
    text: str
