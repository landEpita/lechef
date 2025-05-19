import json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import uvicorn

from control import control_robot

# Charger les commandes
with open("commands.json", "r") as f:
    COMMANDS = json.load(f)

# Créer la liste des commandes valides
VALID_COMMANDS = set(COMMANDS.keys())

# Créer l'app FastAPI
app = FastAPI()

# Requête attendue
class CommandRequest(BaseModel):
    command_name: str

@app.post("/send_command/")
def send_command(request: CommandRequest):
    command_name = request.command_name

    # Vérification de la commande
    if command_name not in VALID_COMMANDS:
        raise HTTPException(status_code=400, detail=f"Commande inconnue: {command_name}")

    onehot_vector = COMMANDS[command_name]

    # Appel de la fonction qui contrôle le robot
    try:
        control_robot(onehot_vector, 0)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'envoi de la commande au robot: {str(e)}")

    return {"status": "success", "command": command_name, "vector": onehot_vector}
