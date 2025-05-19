from fastapi import APIRouter
from .schema import MistralRequest, MistralResponse
from .services import query_mistral

router = APIRouter()

@router.post("/generate", response_model=MistralResponse)
async def generate_from_mistral(req: MistralRequest):
    try:
        response_text = await query_mistral(req)
        return MistralResponse(response=response_text)
    except Exception as e:
        return MistralResponse(response={ "text": "error", "steps": None, "title": None } , error=str(e))
