import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import sys
import os

# sys.path.insert(0, os.path.abspath("backend/src/lerobot_act"))
from lerobot.scripts.stream_policy_actions import run_action

from src.main import policies, robot


logger = logging.getLogger(__name__)
router = APIRouter()

# Schéma d'entrée
class ActionRequest(BaseModel):
    action_index: int

# Schéma de sortie
class ActionResponse(BaseModel):
    message: str

@router.post("/action", response_model=ActionResponse)
async def perform_action(request: ActionRequest):
    try:
        index = request.action_index

        # run_action(policies[index], robot)
        
        logger.info(f"Exécution de l'action avec index {index}")

        return {"message": f"Action {index} exécutée avec succès."}
    except Exception as e:
        logger.error(f"Erreur lors de l'exécution de l'action {index} : {e}")
        raise HTTPException(status_code=500, detail="Erreur interne du robot.")
