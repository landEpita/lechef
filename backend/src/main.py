# src/main.py
import asyncio
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketState  # For checking connection status
from faster_whisper import WhisperModel
import numpy as np
import subprocess
import os

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Locate ffmpeg ---
FFMPEG_PATH = os.getenv("FFMPEG_PATH", "ffmpeg")  # Use environment variable or default to 'ffmpeg'
logger.info(f"Using ffmpeg command: '{FFMPEG_PATH}'")

# --- Load the Faster Whisper model ---
MODEL_NAME = os.getenv("WHISPER_MODEL", "ctranslate2-4you/whisper-tiny.en-ct2-int8_bfloat16")  # Choose model via env var (default: "tiny")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")        # Choose device via env var (default: "cpu")
logger.info(f"Loading Faster Whisper model '{MODEL_NAME}' on CPU using faster-whisper bindings...")
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
logger.info("Faster Whisper model loaded successfully.")

# --- FastAPI and CORS configuration ---
app = FastAPI(title="Realtime Transcription Service")

origins = [
    "http://localhost",
    "http://localhost:5173",  # Default Vite dev port
    "http://127.0.0.1:5173",
    # Add other origins if needed (e.g. production frontend URL)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Audio processing constants ---
INPUT_FORMAT = 'webm'  # Must match the frontend MediaRecorder mimeType container
OUTPUT_SAMPLE_RATE = 16000  # Required sample rate
OUTPUT_CHANNELS = 1  # Mono channel for Whisper
OUTPUT_FORMAT = 'f32le'  # PCM 32-bit float little-endian
BYTES_PER_SAMPLE = np.dtype(np.float32).itemsize  # Typically 4 bytes

# Accumulation buffer settings for transcription
WHISPER_CHUNK_DURATION_S = 2.0  # Process audio in 2-second chunks
WHISPER_CHUNK_SAMPLES = int(WHISPER_CHUNK_DURATION_S * OUTPUT_SAMPLE_RATE)
WHISPER_CHUNK_BYTES = WHISPER_CHUNK_SAMPLES * OUTPUT_CHANNELS * BYTES_PER_SAMPLE
logger.info(f"Accumulating {WHISPER_CHUNK_DURATION_S}s ({WHISPER_CHUNK_BYTES} bytes) of PCM audio before transcription.")

# --- ffmpeg command for audio conversion ---
FFMPEG_COMMAND = [
    FFMPEG_PATH,
    '-loglevel', 'error',   # Only show errors from ffmpeg
    '-f', INPUT_FORMAT,     # Input format from stdin
    '-i', 'pipe:0',         # Read input from stdin
    '-f', OUTPUT_FORMAT,    # Output format for PCM
    '-ar', str(OUTPUT_SAMPLE_RATE),  # Sample rate
    '-ac', str(OUTPUT_CHANNELS),     # Channel count (mono)
    '-'                     # Write output to stdout
]
# Optional: Uncomment below if needed
# FFMPEG_COMMAND.insert(1, '-nostdin')

# --- Transcription function using faster-whisper ---
async def transcribe_pcm_audio(audio_np: np.ndarray) -> str:
    """
    Transcribe a NumPy array of PCM (float32) data using the loaded Faster Whisper model.
    """
    if not model:
        logger.error("Transcription skipped: Faster Whisper model not loaded.")
        return "[Error: Model unavailable]"
    if audio_np.size == 0:
        return "[Silence]"

    try:
        logger.debug(f"Transcribing {audio_np.size} PCM samples using faster-whisper...")
        segments, _ = await asyncio.get_event_loop().run_in_executor(
            None, lambda: list(model.transcribe(audio_np, beam_size=5))
        )
        # Access the transcript text via object attribute instead of dict keys.
        transcription = " ".join(seg.text.strip() for seg in segments if seg.text).strip()

        if not transcription:
            transcription = "[Silence detected]"
        else:
            logger.info(f"Transcription result: '{transcription}'")
        return transcription

    except Exception as e:
        logger.exception(f"Error during faster-whisper transcription process: {e}")
        return "[Error during transcription process]"

# --- WebSocket endpoint for streaming ---
@app.websocket("/api/stream/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Handles WebSocket connections for real-time audio streaming and transcription."""
    await websocket.accept()
    client_host = websocket.client.host
    logger.info(f"WebSocket client connected from: {client_host}")

    process = None
    transcription_consumer_task = None
    pcm_buffer = bytearray()

    try:
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
             logger.error(f"CRITICAL ERROR: ffmpeg command '{FFMPEG_PATH}' not found. Ensure ffmpeg is installed and in PATH.")
             await websocket.close(code=1011, reason="Server configuration error: ffmpeg not found.")
             return
        except Exception as ffmpeg_start_err:
             logger.error(f"Error starting ffmpeg process for {client_host}: {ffmpeg_start_err}", exc_info=True)
             await websocket.close(code=1011, reason="Server error: Failed to start audio processor.")
             return

        async def consume_ffmpeg_output():
            nonlocal pcm_buffer
            logger.debug(f"[{client_host}] Starting ffmpeg output consumer task.")
            try:
                while process and process.returncode is None and not process.stdout.at_eof():
                    pcm_chunk = await process.stdout.read(4096)
                    if not pcm_chunk:
                        logger.info(f"[{client_host}] ffmpeg stdout EOF reached.")
                        break

                    pcm_buffer.extend(pcm_chunk)

                    while len(pcm_buffer) >= WHISPER_CHUNK_BYTES:
                        whisper_data_bytes = pcm_buffer[:WHISPER_CHUNK_BYTES]
                        pcm_buffer = pcm_buffer[WHISPER_CHUNK_BYTES:]
                        try:
                            audio_np = np.frombuffer(whisper_data_bytes, dtype=np.float32)
                        except Exception as np_err:
                             logger.error(f"[{client_host}] Error converting PCM bytes to NumPy array: {np_err}")
                             continue

                        logger.debug(f"[{client_host}] Scheduling transcription task for {audio_np.size} PCM samples.")
                        whisper_task = asyncio.create_task(transcribe_pcm_audio(audio_np))

                        try:
                            transcription_text = await whisper_task
                            if websocket.client_state == WebSocketState.CONNECTED:
                                if transcription_text and not transcription_text.startswith("[Error"):
                                    logger.info(f"[{client_host}] Sending transcription: '{transcription_text}'")
                                    await websocket.send_json({
                                        "transcription": transcription_text,
                                        "translation": ""  # Placeholder for future translation
                                    })
                                elif transcription_text:
                                    logger.warning(f"[{client_host}] Sending error message to client: {transcription_text}")
                                    await websocket.send_json({"transcription": transcription_text, "translation": ""})
                            else:
                                 logger.warning(f"[{client_host}] WebSocket disconnected before sending transcription.")
                                 break

                        except Exception as send_err:
                             logger.error(f"[{client_host}] Error sending transcription via WebSocket: {send_err}")
                             break

                    await asyncio.sleep(0.001)

            except asyncio.CancelledError:
                 logger.info(f"[{client_host}] ffmpeg output consumer task cancelled.")
            except ConnectionResetError:
                 logger.warning(f"[{client_host}] Connection reset while reading ffmpeg stdout.")
            except Exception as e:
                logger.exception(f"[{client_host}] Error in consume_ffmpeg_output task: {e}")
            finally:
                logger.info(f"[{client_host}] ffmpeg output consumer task finished.")
                MIN_REMAINING_SAMPLES = OUTPUT_SAMPLE_RATE // 4
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
                         logger.error(f"[{client_host}] Error sending final transcription: {final_send_err}")
                else:
                     logger.debug(f"[{client_host}] Discarding small remaining PCM buffer ({len(pcm_buffer)} bytes).")

        transcription_consumer_task = asyncio.create_task(consume_ffmpeg_output())

        while True:
            if process.returncode is not None:
                 logger.warning(f"[{client_host}] ffmpeg process terminated unexpectedly (code: {process.returncode}).")
                 break

            try:
                chunk = await websocket.receive_bytes()
                if not chunk:
                    logger.debug(f"[{client_host}] Received empty chunk, ignoring.")
                    continue

                if process.stdin and not process.stdin.is_closing():
                    process.stdin.write(chunk)
                    await process.stdin.drain()
                else:
                    logger.warning(f"[{client_host}] ffmpeg stdin is closing or closed. Cannot write more data.")
                    break

            except WebSocketDisconnect:
                 logger.info(f"[{client_host}] WebSocket disconnected by client.")
                 break
            except ConnectionResetError:
                 logger.warning(f"[{client_host}] Connection reset while writing to ffmpeg stdin.")
                 break
            except Exception as write_err:
                 logger.error(f"[{client_host}] Error writing chunk to ffmpeg stdin: {write_err}")
                 break

        logger.info(f"[{client_host}] Reception loop finished.")

    except WebSocketDisconnect:
        logger.info(f"WebSocket client {client_host} disconnected.")
    except Exception as e:
        logger.error(f"Unexpected error in WebSocket handler for {client_host}: {e}", exc_info=True)
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close(code=1011, reason=f"Internal server error: {type(e).__name__}")
    finally:
        logger.info(f"Cleaning up resources for WebSocket client {client_host}.")
        if transcription_consumer_task and not transcription_consumer_task.done():
            logger.debug(f"[{client_host}] Cancelling ffmpeg output consumer task...")
            transcription_consumer_task.cancel()
            try:
                await transcription_consumer_task
            except asyncio.CancelledError:
                logger.debug(f"[{client_host}] Consumer task successfully cancelled.")
            except Exception as cancel_err:
                logger.error(f"[{client_host}] Error during consumer task cancellation: {cancel_err}")

        if process and process.returncode is None:
            logger.debug(f"[{client_host}] Closing ffmpeg stdin...")
            try:
                if process.stdin and not process.stdin.is_closing():
                    process.stdin.close()
            except Exception as stdin_close_err:
                logger.error(f"[{client_host}] Error closing ffmpeg stdin: {stdin_close_err}")

            logger.debug(f"[{client_host}] Waiting for ffmpeg process (PID: {process.pid}) to terminate...")
            try:
                stdout_data, stderr_data = await asyncio.wait_for(process.communicate(), timeout=5.0)
                logger.info(f"[{client_host}] ffmpeg process terminated with code {process.returncode}.")
                if stderr_data:
                    logger.error(f"[{client_host}] ffmpeg stderr output:\n{stderr_data.decode('utf-8', errors='ignore').strip()}")
            except asyncio.TimeoutError:
                logger.warning(f"[{client_host}] Timeout waiting for ffmpeg process; killing process (PID: {process.pid}).")
                try:
                    process.kill()
                    await asyncio.sleep(0.1)
                    logger.info(f"[{client_host}] ffmpeg process killed.")
                except ProcessLookupError:
                    logger.warning(f"[{client_host}] ffmpeg process (PID: {process.pid}) already terminated.")
                except Exception as kill_err:
                    logger.error(f"[{client_host}] Error killing ffmpeg process: {kill_err}")
            except Exception as comm_err:
                logger.error(f"[{client_host}] Error during ffmpeg communicate/termination: {comm_err}")
        elif process:
             logger.debug(f"[{client_host}] ffmpeg process (PID: {process.pid}) already terminated with code {process.returncode}.")

        if websocket.client_state == WebSocketState.CONNECTED:
            logger.debug(f"[{client_host}] Closing WebSocket connection from server side.")
            try:
                await websocket.close(code=1000)
            except Exception as ws_close_err:
                logger.warning(f"[{client_host}] Error closing WebSocket: {ws_close_err}")
        elif websocket.client_state != WebSocketState.DISCONNECTED:
             logger.warning(f"[{client_host}] WebSocket in unexpected state ({websocket.client_state}) during cleanup.")

        logger.info(f"Cleanup complete for WebSocket client {client_host}.")

# --- Uvicorn Startup (if running directly) ---
if __name__ == "__main__":
    if not model:
        print("\n!!! CRITICAL ERROR: Faster Whisper model failed to load. Check logs. !!!\n")
    print("\n--- Realtime Transcription Server Ready ---")
    print(f"Faster Whisper Model: {MODEL_NAME} (Device: {DEVICE})")
    print(f"Listening for WebSocket connections on /api/stream/ws")
    print(f"Allowed Origins: {origins}")
    print("\nRun with: uvicorn main:app --host 0.0.0.0 --port 8000 --reload\n")
