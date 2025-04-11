# backend/src/main.py
import asyncio
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketState # Import WebSocketState for checking connection status
import whisper
import numpy as np
import subprocess
import os

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Trouver ffmpeg ---
FFMPEG_PATH = os.getenv("FFMPEG_PATH", "ffmpeg") # Use environment variable or default to 'ffmpeg'
logger.info(f"Using ffmpeg command: '{FFMPEG_PATH}'")

# --- Charger le modèle Whisper ---
MODEL_NAME = os.getenv("WHISPER_MODEL", "tiny") # Allow choosing model via env var
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")     # Allow choosing device via env var
try:
    logger.info(f"Loading Whisper model '{MODEL_NAME}' on device '{DEVICE}'...")
    model = whisper.load_model(MODEL_NAME, device=DEVICE)
    logger.info("Whisper model loaded successfully.")
except Exception as e:
    logger.error(f"CRITICAL ERROR loading Whisper model '{MODEL_NAME}': {e}", exc_info=True)
    logger.error("The application might not function correctly.")
    # Depending on the desired behavior, you might want to exit here:
    # raise SystemExit(f"Failed to load Whisper model: {e}")
    model = None # Set model to None to indicate failure

# --- Configuration FastAPI et CORS ---
app = FastAPI(title="Realtime Transcription Service")

origins = [
    "http://localhost",
    "http://localhost:5173", # Default Vite dev port
    "http://127.0.0.1:5173",
    # Add other origins if needed (e.g., production frontend URL)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Constantes pour le traitement Audio ---
# Input format from client (via MediaRecorder -> ffmpeg stdin)
INPUT_FORMAT = 'webm' # Should match frontend MediaRecorder mimeType container
# Output format from ffmpeg (to be processed by Whisper)
OUTPUT_SAMPLE_RATE = 16000 # Required by Whisper
OUTPUT_CHANNELS = 1 # Required by Whisper
OUTPUT_FORMAT = 'f32le' # PCM float 32-bit little-endian
BYTES_PER_SAMPLE = np.dtype(np.float32).itemsize # Usually 4

# Accumulation buffer settings for Whisper
WHISPER_CHUNK_DURATION_S = 2.0 # Process audio in X-second chunks for Whisper
WHISPER_CHUNK_SAMPLES = int(WHISPER_CHUNK_DURATION_S * OUTPUT_SAMPLE_RATE)
WHISPER_CHUNK_BYTES = WHISPER_CHUNK_SAMPLES * OUTPUT_CHANNELS * BYTES_PER_SAMPLE
logger.info(f"Accumulating {WHISPER_CHUNK_DURATION_S}s ({WHISPER_CHUNK_BYTES} bytes) of PCM audio before Whisper transcription.")

# --- Commande FFmpeg ---
FFMPEG_COMMAND = [
    FFMPEG_PATH,
    # Input options
    '-loglevel', 'error',   # Only show errors from ffmpeg
    '-f', INPUT_FORMAT,     # Format of the input stream coming from stdin
    '-i', 'pipe:0',         # Read input from standard input (the pipe)
    # Output options
    '-f', OUTPUT_FORMAT,    # Output format: PCM float 32-bit little-endian
    '-ar', str(OUTPUT_SAMPLE_RATE), # Output sample rate
    '-ac', str(OUTPUT_CHANNELS),    # Output channels (mono)
    '-'                     # Write output to standard output (pipe)
]
# Optional: Add '-nostdin' if your ffmpeg supports it and you want extra safety
# FFMPEG_COMMAND.insert(1, '-nostdin')

# --- Fonction de Transcription Whisper (modifiée pour PCM) ---
async def transcribe_pcm_audio(audio_np: np.ndarray) -> str:
    """
    Transcribes a NumPy array containing PCM float32 audio data using the loaded Whisper model.
    """
    if not model:
        logger.error("Transcription skipped: Whisper model not loaded.")
        return "[Error: Whisper model unavailable]"
    if audio_np.size == 0:
        # This shouldn't happen if called correctly, but good to check
        return "[Silence]"

    transcription = "[Error during transcription]"
    try:
        logger.debug(f"Transcribing {audio_np.size} PCM samples...")
        # Ensure audio is float32 (it should be, coming from ffmpeg with f32le)
        # audio_np = audio_np.astype(np.float32) # Usually not needed if ffmpeg output is correct

        # Transcribe using Whisper model
        # Consider adding language detection or specifying language if needed:
        # result = model.transcribe(audio_np, fp16=False, language="fr") # Example: French
        result = model.transcribe(audio_np, fp16=(DEVICE != "cpu"), language="fr") # Use fp16 only if on GPU

        transcription = result["text"].strip()
        if not transcription:
            transcription = "[Silence detected]" # More specific message for empty transcription
        logger.info(f"Transcription result: '{transcription}'")

    except Exception as e:
        logger.exception(f"Error during Whisper transcription process: {e}") # Log full traceback
        transcription = "[Error during transcription process]"

    return transcription

# --- Endpoint WebSocket (remanié pour le streaming persistant vers FFmpeg) ---
@app.websocket("/api/stream/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Handles WebSocket connections for real-time audio streaming and transcription."""
    await websocket.accept()
    client_host = websocket.client.host
    logger.info(f"WebSocket client connected from: {client_host}")

    process = None
    transcription_consumer_task = None
    pcm_buffer = bytearray()
    # Use a queue for thread-safe communication between tasks if Whisper runs longer
    # transcription_queue = asyncio.Queue()

    try:
        # --- Démarrer le processus FFmpeg persistant pour cette connexion ---
        logger.info(f"Starting ffmpeg process for {client_host}: {' '.join(FFMPEG_COMMAND)}")
        try:
            process = await asyncio.create_subprocess_exec(
                *FFMPEG_COMMAND,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            logger.info(f"ffmpeg process started (PID: {process.pid}) for {client_host}")
        except FileNotFoundError:
             logger.error(f"CRITICAL ERROR: ffmpeg command '{FFMPEG_PATH}' not found. Ensure ffmpeg is installed and in the system PATH.")
             await websocket.close(code=1011, reason="Server configuration error: ffmpeg not found.")
             return # Stop processing this connection
        except Exception as ffmpeg_start_err:
             logger.error(f"Error starting ffmpeg process for {client_host}: {ffmpeg_start_err}", exc_info=True)
             await websocket.close(code=1011, reason=f"Server error: Failed to start audio processor.")
             return # Stop processing this connection


        # --- Tâche pour consommer la sortie stdout de FFmpeg (données PCM) ---
        async def consume_ffmpeg_output():
            nonlocal pcm_buffer
            logger.debug(f"[{client_host}] Starting ffmpeg output consumer task.")
            try:
                while process and process.returncode is None and not process.stdout.at_eof():
                    # Lire les données PCM de la sortie standard de FFmpeg
                    # Lire en petits morceaux pour éviter de bloquer si la sortie de FFmpeg est lente
                    # et pour permettre des transcriptions plus fréquentes si nécessaire
                    pcm_chunk = await process.stdout.read(4096) # Read up to 4kB
                    if not pcm_chunk:
                        # Fin du flux de FFmpeg (peut se produire si stdin est fermé et que le processus se termine)
                        logger.info(f"[{client_host}] ffmpeg stdout EOF reached.")
                        break

                    # Ajouter au tampon PCM
                    pcm_buffer.extend(pcm_chunk)

                    # Vérifier si le tampon contient suffisamment de données pour Whisper
                    while len(pcm_buffer) >= WHISPER_CHUNK_BYTES:
                        # Extraire un morceau pour Whisper
                        whisper_data_bytes = pcm_buffer[:WHISPER_CHUNK_BYTES]
                        # Retirer le morceau du tampon
                        pcm_buffer = pcm_buffer[WHISPER_CHUNK_BYTES:]

                        # Convertir en tableau NumPy
                        try:
                            audio_np = np.frombuffer(whisper_data_bytes, dtype=np.float32)
                        except Exception as np_err:
                             logger.error(f"[{client_host}] Error converting PCM bytes to NumPy array: {np_err}")
                             continue # Skip this chunk

                        # Démarrer la tâche de transcription Whisper (non bloquante)
                        logger.debug(f"[{client_host}] Scheduling Whisper task for {audio_np.size} PCM samples.")
                        whisper_task = asyncio.create_task(transcribe_pcm_audio(audio_np))

                        # Récupérer le résultat et l'envoyer au client
                        try:
                            # On attend le résultat ici, mais si Whisper est lent,
                            # cela pourrait ralentir la lecture de la sortie de FFmpeg.
                            # Une Queue pourrait découpler cela davantage.
                            transcription_text = await whisper_task
                            if websocket.client_state == WebSocketState.CONNECTED:
                                if transcription_text and not transcription_text.startswith("[Error"):
                                    logger.info(f"[{client_host}] Sending transcription: '{transcription_text}'")
                                    await websocket.send_json({
                                        "transcription": transcription_text,
                                        "translation": "" # Placeholder for potential future translation
                                    })
                                elif transcription_text: # Envoyer aussi les messages d'erreur pour le débogage côté client
                                    logger.warning(f"[{client_host}] Sending error message to client: {transcription_text}")
                                    await websocket.send_json({"transcription": transcription_text, "translation": ""})
                            else:
                                 logger.warning(f"[{client_host}] WebSocket disconnected before sending transcription.")
                                 break # Exit loop if client disconnected

                        except Exception as send_err:
                             logger.error(f"[{client_host}] Error sending transcription via WebSocket: {send_err}")
                             # If sending fails, assume connection is broken
                             break # Exit loop

                    # Céder brièvement le contrôle pour permettre à d'autres tâches de s'exécuter
                    await asyncio.sleep(0.001) # Very short sleep

            except asyncio.CancelledError:
                 logger.info(f"[{client_host}] ffmpeg output consumer task cancelled.")
                 # Don't re-raise cancelled error
            except ConnectionResetError:
                 logger.warning(f"[{client_host}] Connection reset while reading ffmpeg stdout (client likely disconnected abruptly).")
            except Exception as e:
                # Log any other unexpected errors in the consumer task
                logger.exception(f"[{client_host}] Error in consume_ffmpeg_output task: {e}")
            finally:
                logger.info(f"[{client_host}] ffmpeg output consumer task finished.")
                # --- Traitement optionnel des données restantes dans pcm_buffer ---
                # Transcrire le dernier segment incomplet si assez long ?
                MIN_REMAINING_SAMPLES = OUTPUT_SAMPLE_RATE // 4 # e.g., 0.25 seconds
                if len(pcm_buffer) >= MIN_REMAINING_SAMPLES * BYTES_PER_SAMPLE:
                    logger.info(f"[{client_host}] Processing remaining {len(pcm_buffer)} bytes of PCM data.")
                    try:
                         audio_np = np.frombuffer(bytes(pcm_buffer), dtype=np.float32)
                         whisper_task = asyncio.create_task(transcribe_pcm_audio(audio_np))
                         transcription_text = await whisper_task
                         if websocket.client_state == WebSocketState.CONNECTED:
                              if transcription_text and not transcription_text.startswith("[Error"):
                                   await websocket.send_json({"transcription": transcription_text, "translation": ""})
                              elif transcription_text:
                                   await websocket.send_json({"transcription": transcription_text, "translation": ""})
                    except Exception as final_send_err:
                         logger.error(f"[{client_host}] Error sending final remaining transcription: {final_send_err}")
                else:
                     logger.debug(f"[{client_host}] Discarding small remaining PCM buffer ({len(pcm_buffer)} bytes).")


        transcription_consumer_task = asyncio.create_task(consume_ffmpeg_output())

        # --- Boucle principale pour recevoir les morceaux audio du client ---
        while True:
            if process.returncode is not None:
                 logger.warning(f"[{client_host}] ffmpeg process terminated unexpectedly (code: {process.returncode}). Stopping reception loop.")
                 break

            try:
                # Recevoir le chunk audio (webm) du client
                chunk = await websocket.receive_bytes()
                if not chunk:
                    logger.debug(f"[{client_host}] Received empty chunk, ignoring.")
                    continue

                # Écrire le chunk dans l'entrée standard (stdin) de FFmpeg
                if process.stdin and not process.stdin.is_closing():
                    # logger.debug(f"[{client_host}] Writing {len(chunk)} bytes to ffmpeg stdin")
                    process.stdin.write(chunk)
                    await process.stdin.drain() # S'assurer que les données sont écrites
                else:
                    logger.warning(f"[{client_host}] ffmpeg stdin is closing or closed. Cannot write more data.")
                    break # Sortir de la boucle si on ne peut plus écrire

            except WebSocketDisconnect:
                 logger.info(f"[{client_host}] WebSocket disconnected by client.")
                 break # Sortir de la boucle si le client se déconnecte
            except ConnectionResetError:
                 logger.warning(f"[{client_host}] Connection reset while writing to ffmpeg stdin.")
                 break # Sortir de la boucle en cas de réinitialisation de la connexion
            except Exception as write_err:
                 logger.error(f"[{client_host}] Error writing chunk to ffmpeg stdin: {write_err}")
                 break # Sortir de la boucle en cas d'erreur d'écriture

        # --- Fin de la boucle de réception ---
        logger.info(f"[{client_host}] Reception loop finished.")


    except WebSocketDisconnect:
        # Géré dans la boucle principale, mais peut aussi se produire lors de l'acceptation initiale
        logger.info(f"WebSocket client {client_host} disconnected.")
    except Exception as e:
        # Gérer les erreurs inattendues pendant la configuration ou la boucle principale
        logger.error(f"Unexpected error in WebSocket handler for {client_host}: {e}", exc_info=True)
        # Essayer de fermer proprement si possible
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close(code=1011, reason=f"Internal server error: {type(e).__name__}")
    finally:
        # --- Nettoyage ---
        logger.info(f"Cleaning up resources for WebSocket client {client_host}.")

        # 1. Annuler la tâche consommatrice si elle est en cours d'exécution
        if transcription_consumer_task and not transcription_consumer_task.done():
            logger.debug(f"[{client_host}] Cancelling ffmpeg output consumer task...")
            transcription_consumer_task.cancel()
            try:
                await transcription_consumer_task # Attendre la fin de la tâche (peut lever CancelledError)
            except asyncio.CancelledError:
                logger.debug(f"[{client_host}] Consumer task successfully cancelled.")
            except Exception as cancel_err:
                logger.error(f"[{client_host}] Error during consumer task cancellation/cleanup: {cancel_err}")

        # 2. Fermer stdin de FFmpeg et attendre la fin du processus
        if process and process.returncode is None:
            logger.debug(f"[{client_host}] Closing ffmpeg stdin...")
            try:
                if process.stdin and not process.stdin.is_closing():
                    process.stdin.close()
                    # await process.stdin.wait_closed() # Disponible Python 3.7+ je crois, utile ?
            except Exception as stdin_close_err:
                logger.error(f"[{client_host}] Error closing ffmpeg stdin: {stdin_close_err}")

            logger.debug(f"[{client_host}] Waiting for ffmpeg process (PID: {process.pid}) to terminate...")
            try:
                # Attendre la fin du processus avec un timeout
                # communicate() lit le reste de stdout/stderr et attend la fin
                stdout_data, stderr_data = await asyncio.wait_for(process.communicate(), timeout=5.0)
                logger.info(f"[{client_host}] ffmpeg process terminated with code {process.returncode}.")
                if stderr_data:
                    # Afficher les erreurs potentielles de FFmpeg
                    logger.error(f"[{client_host}] ffmpeg stderr output:\n{stderr_data.decode('utf-8', errors='ignore').strip()}")
            except asyncio.TimeoutError:
                logger.warning(f"[{client_host}] Timeout waiting for ffmpeg process to terminate gracefully. Killing process (PID: {process.pid}).")
                try:
                    process.kill()
                    # Attendre un court instant après kill
                    await asyncio.sleep(0.1)
                    logger.info(f"[{client_host}] ffmpeg process killed.")
                except ProcessLookupError:
                    logger.warning(f"[{client_host}] ffmpeg process (PID: {process.pid}) already terminated before kill.")
                except Exception as kill_err:
                    logger.error(f"[{client_host}] Error killing ffmpeg process (PID: {process.pid}): {kill_err}")
            except Exception as comm_err:
                logger.error(f"[{client_host}] Error during ffmpeg communicate/termination: {comm_err}")
        elif process:
             logger.debug(f"[{client_host}] ffmpeg process (PID: {process.pid}) already terminated with code {process.returncode}.")


        # 3. Fermer la connexion WebSocket si elle n'est pas déjà fermée
        if websocket.client_state == WebSocketState.CONNECTED:
            logger.debug(f"[{client_host}] Closing WebSocket connection from server side.")
            try:
                await websocket.close(code=1000) # Code 1000: Normal Closure
            except Exception as ws_close_err:
                # Peut échouer si déjà fermée par le client entre-temps
                 logger.warning(f"[{client_host}] Error closing WebSocket (might be already closed): {ws_close_err}")
        elif websocket.client_state != WebSocketState.DISCONNECTED:
             logger.warning(f"[{client_host}] WebSocket in unexpected state ({websocket.client_state}) during cleanup.")


        logger.info(f"Cleanup complete for WebSocket client {client_host}.")


# --- Lancement Uvicorn (pour exécution directe) ---
if __name__ == "__main__":
    if not model:
        print("\n!!! CRITICAL ERROR: Whisper model failed to load. The application may not work. Check logs. !!!\n")
        # Optionnel: Ne pas démarrer le serveur si le modèle n'est pas chargé
        # import sys
        # sys.exit(1)

    print("\n--- Realtime Transcription Server Ready ---")
    print(f"Whisper Model: {MODEL_NAME} ({DEVICE})")
    print(f"Listening for WebSocket connections on /api/stream/ws")
    print(f"Allowed Origins: {origins}")
    print("\nRun with: uvicorn main:app --host 0.0.0.0 --port 8000 --reload\n")

    # Note: Le code ci-dessous ne sera exécuté que si vous lancez `python main.py`
    # Il est préférable d'utiliser `uvicorn main:app ...` directement.
    # import uvicorn
    # uvicorn.run(app, host="0.0.0.0", port=8000) # Retire --reload ici car non supporté