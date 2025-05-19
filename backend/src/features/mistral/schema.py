from pydantic import BaseModel
from typing import List, Literal

class Message(BaseModel):
    role: Literal["user", "bot"]
    text: str

class MistralRequest(BaseModel):
    history: List[Message]

class MistralResponseData(BaseModel):
    title: str | None
    steps: List[str] | None
    text: str
    

class MistralResponse(BaseModel):
    response: MistralResponseData | None = None
    error: str | None = None
