# src/features/streaming/router.py
import logging
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .services import process_audio_chunk, translate_text_async
import asyncio # Importer asyncio

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stream", tags=["Streaming"])

# --- Constantes pour l'accumulation ---
ACCUMULATION_DURATION_S = 2.0 # Accumuler X secondes d'audio
BYTES_PER_SECOND_APPROX = 16000 * 2 # Approximation pour 16kHz 16-bit mono (ajuster si f32le)
ACCUMULATION_BYTES = int(BYTES_PER_SECOND_APPROX * ACCUMULATION_DURATION_S)

@router.websocket("/ws")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    logger.info(f"WebSocket client connected from: {websocket.client.host}")

    audio_buffer = bytearray() # Buffer pour accumuler les chunks

    try:
        while True:
            audio_chunk = await websocket.receive_bytes()
            if not audio_chunk:
                continue

            audio_buffer.extend(audio_chunk) # Ajouter le chunk au buffer

            # Traiter seulement si le buffer est assez grand
            if len(audio_buffer) >= ACCUMULATION_BYTES:
                logger.debug(f"Processing accumulated buffer of size {len(audio_buffer)}")
                # Copier le buffer à traiter pour éviter problèmes de concurrence
                buffer_to_process = bytes(audio_buffer)
                # Vider le buffer pour la prochaine accumulation
                audio_buffer.clear()

                # --- Lancer le traitement en tâche de fond pour ne pas bloquer la réception ---
                async def process_and_send():
                    transcription = await process_audio_chunk(buffer_to_process)
                    logger.debug(f"Transcription result: '{transcription}'")

                    translation = ""
                    if transcription:
                        logger.debug(f"Calling translation for: '{transcription}'")
                        translation = await translate_text_async(transcription)
                        logger.debug(f"Translation result: '{translation}'")

                    if transcription or translation:
                        response_data = {
                            "transcription": transcription,
                            "translation": translation
                        }
                        try:
                            await websocket.send_json(response_data)
                            logger.debug(f"Sent JSON: {response_data}")
                        except WebSocketDisconnect:
                             logger.warning("WebSocket disconnected during send.")
                        except Exception as send_err:
                             logger.error(f"Error sending JSON: {send_err}")

                # Créer une tâche asyncio pour ne pas bloquer la boucle while True
                asyncio.create_task(process_and_send())

            # else: # Optionnel: logguer la taille actuelle du buffer
            #     logger.debug(f"Accumulating buffer: {len(audio_buffer)} / {ACCUMULATION_BYTES} bytes")


    except WebSocketDisconnect:
        logger.info(f"WebSocket client {websocket.client.host} disconnected (WebSocketDisconnect).")
    except Exception as e:
        logger.exception(f"Error during WebSocket communication with {websocket.client.host}: {e}")
        # ... (gestion erreur et fermeture) ...
    finally:
        logger.debug(f"Cleaning up resources for WebSocket {websocket.client.host}")
        # ... (nettoyage contexte si besoin) ...