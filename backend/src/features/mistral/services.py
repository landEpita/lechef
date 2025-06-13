import json
import logging
import httpx
from fastapi import HTTPException
from .schema import MistralRequest

logger = logging.getLogger(__name__)

MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"
MISTRAL_API_KEY = "J6l1nXjly656qECj5TosnIW2ndCT2BR5"  

MODEL_NAME = "mistral-tiny"  # ou autre modèle

ingredients_mapping = { # Pour mapper les actions à leur index de policy
    "place_sandwich_bread_bottom" : 0,
    "add_cheese_slice" : 1,
    "add_ham_slice" : 2,
    "add_salad_slice" : 3,
    "place_sandwich_bread_top" : 4
}

def delete_doublons(ingredients):
    vue = set()
    ingredients_without_doublons = []
    for x in ingredients:
        if x not in vue:
            vue.add(x)
            ingredients_without_doublons.append(x)
    return ingredients_without_doublons  # L’ordre est conservé


async def query_mistral(request: MistralRequest) -> str:
    if not MISTRAL_API_KEY:
        raise HTTPException(status_code=500, detail="MISTRAL_API_KEY missing")

    # ─────────────────────────  SYSTEM PROMPT  ──────────────────────────
    system_prompt = {
        "role": "system",
        "content": (
            # ─ persona ─
            "You are Roberto, a professional chef who can prepare ONLY one thing: sandwiches. "
            "You know absolutely nothing else about cooking.\n\n"

            # ─ allowed steps ─
            "Allowed steps (function names you can output):\n"
            "- place_sandwich_bread_bottom\n"
            "- add_ham_slice            (burger only, exactly once)\n"
            "- add_cheese_slice          (optional / repeatable)\n"
            "- add_salad_slice          (optional / repeatable)\n"
            "- place_sandwich_bread_top\n\n"

            # ─ default recipes ─
            "Default sandwich order:\n"
            "  place_sandwich_bread_bottom → add_cheese_slice → add_salad_slice → place_sandwich_bread_top\n\n"

            # ─ customisation rules ─
            "- Users may omit cheese/salad/ham.\n"
            "- You can only use each ingredient once."
            "- No other ingredients are allowed; otherwise reply exactly: "
            "\"Sorry, I only make sandwiches.\" (nothing more).\n\n"

            # ─ output format ─
            "Always respond with ONE JSON object and nothing else.\n"
            "Required key:\n"
            "  • text   (string) – brief chef reply (≤ 2 short sentences)\n"
            "Optional keys (include ONLY when preparing a sandwich):\n"
            "  • title  (string) – short dish name\n"
            "  • steps  (array)  – ordered list of function names\n\n"
            "Examples:\n"
            "# Casual chat\n"
            "{\n"
            "  \"text\": \"Bonjour! I’m ready when you want a sandwich.\"\n"
            "}\n\n"
            "# Sandwiche with cheese and ham, no salad.\n"
            "{\n"
            "  \"title\": \"LeChef's Cheese Sandwiche\",\n"
            "  \"steps\": [\n"
            "    \"place_sandwich_bread_bottom\",\n"
            "    \"add_cheese_slice\",\n"
            "    \"add_ham_slice\", \n"
            "    \"place_sandwich_bread_top\"\n"
            "  ],\n"
            "  \"text\": \"Ham and cheese, no salad. Enjoy!\"\n"
            "}\n\n"
            "Never output anything except this JSON object or the single refusal sentence."
        )
    }

    # ───────────────────────  BUILD MESSAGE LIST  ───────────────────────
    messages = [system_prompt]
    for m in request.history:
        role = "user" if m.role == "user" else "assistant"
        # Ignore assistant messages that include tool_calls
        if getattr(m, "tool_calls", None):
            continue
        messages.append({"role": role, "content": m.text})

    # ────────────────────────────  CALL API  ────────────────────────────
    headers = {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "temperature": 0.0,
        "top_p": 1.0,
        "max_tokens": 200,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(MISTRAL_API_URL, json=payload, headers=headers)

        if response.status_code != 200:
            logger.error("Mistral error %s: %s", response.status_code, response.text)
            raise HTTPException(status_code=500, detail="Mistral API failed")

        content = response.json()["choices"][0]["message"]["content"]

        try:
            content = json.loads(content)
        except json.JSONDecodeError:
            logger.error("Mistral response is not valid JSON: %s", content)
            raise HTTPException(status_code=500, detail="Invalid JSON response from Mistral")


        
        print(content)
        print(type(content))
        logger.debug("Mistral reply: %s", content)
        if "steps" not in content:
            content["steps"] = None
        elif "steps" in content:
            mapped_steps = []
            for step in content["steps"]:
                mapped_steps.append(ingredients_mapping[step])
            content["steps"] = delete_doublons(mapped_steps)
        if "title" not in content:
            content["title"] = None
        print(content)
        return content

    except Exception as exc:
        logger.exception("Failed to query Mistral")
        raise HTTPException(status_code=500, detail=str(exc))