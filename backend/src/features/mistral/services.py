import logging
import httpx
from fastapi import HTTPException
from .schema import MistralRequest

logger = logging.getLogger(__name__)

MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"
MISTRAL_API_KEY = "J6l1nXjly656qECj5TosnIW2ndCT2BR5"  # 🔒 utilise une variable d'env en prod

MODEL_NAME = "mistral-tiny"  # ou autre modèle

async def query_mistral(request: MistralRequest) -> str:
    system_prompt = {
        "role": "system",
        "content": (
            "You are Roberto, an enthusiastic chef. "
            "You love to share delicious recipes and cooking tips. "
            "Always reply with short, friendly sentences — like you're chatting at the table with a guest. "
            "Respond in English only."
        )
    }

    messages = [system_prompt] + [
        {"role": "user" if m.role == "user" else "assistant", "content": m.text}
        for m in request.history
    ]

    headers = {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "temperature": 0.7,
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(MISTRAL_API_URL, json=payload, headers=headers)

        if response.status_code != 200:
            logger.error(f"Mistral error {response.status_code}: {response.text}")
            raise HTTPException(status_code=500, detail="Mistral API failed")

        data = response.json()
        return data["choices"][0]["message"]["content"].strip()

    except Exception as e:
        logger.exception("Failed to query Mistral")
        raise HTTPException(status_code=500, detail=str(e))
