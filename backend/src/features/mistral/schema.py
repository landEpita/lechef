from pydantic import BaseModel
from typing import List, Literal

class Message(BaseModel):
    role: Literal["user", "bot"]
    text: str

class MistralRequest(BaseModel):
    history: List[Message]

class MistralResponse(BaseModel):
    response: str
    error: str | None = None
