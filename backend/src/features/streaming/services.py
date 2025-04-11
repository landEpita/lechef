# src/features/streaming/services.py
import logging
import asyncio
import json  # For logging display
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from transformers import pipeline
# --- Import for Faster Whisper ---
from faster_whisper import WhisperModel
import ffmpeg  # Import for ffmpeg-python if used in conversion
import subprocess  # Alternative for calling ffmpeg

# --- Configuration (ideally move this to core.config) ---
WHISPER_MODEL_NAME = "distil-large-v3"  # Use "tiny" for faster performance on CPU
TRANSLATION_MODEL_NAME = "Helsinki-NLP/opus-mt-en-fr"
DEVICE = "cpu"
COMPUTE_TYPE = "float16"  # Quantization for CPU
NUM_ML_WORKERS = 4  # Adjust as needed

logger = logging.getLogger(__name__)

# --- Thread Pool and Model Management ---
try:
    ml_executor = ThreadPoolExecutor(max_workers=NUM_ML_WORKERS, thread_name_prefix="MLWorker")
    models = {}  # Dictionary to hold loaded models
except Exception as e:
    logger.exception("Failed to create ThreadPoolExecutor")
    ml_executor = None
    models = {}

# --- Load and Clean Up Models ---
def load_models():
    """Load necessary ML models."""
    global models
    logger.info(f"Loading models... Device: {DEVICE}, Compute Type: {COMPUTE_TYPE}")
    if not ml_executor:
        logger.error("Cannot load models, ML executor not available.")
        return
    try:
        # === Load Faster Whisper Model ===
        logger.info(f"Loading Faster Whisper model: {WHISPER_MODEL_NAME}")
        models['whisper'] = WhisperModel(WHISPER_MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
        logger.info(f"Faster Whisper model '{WHISPER_MODEL_NAME}' loaded.")
        
        # === Load Translator Model ===
        logger.info(f"Loading translation model: {TRANSLATION_MODEL_NAME}")
        models['translator'] = pipeline(
            "translation_en_to_fr", model=TRANSLATION_MODEL_NAME, device=-1  # Force CPU usage for pipeline
        )
        logger.info(f"Translation model '{TRANSLATION_MODEL_NAME}' loaded.")
    except Exception as e:
        logger.exception(f"CRITICAL: Error loading ML models: {e}")
        raise RuntimeError("Failed to load essential ML models") from e

def cleanup_models():
    """Clean up resources."""
    global models, ml_executor
    logger.info("Shutting down ML executor and cleaning up models...")
    models.clear()
    if ml_executor:
        ml_executor.shutdown(wait=True)
        logger.info("ML executor shut down.")

# --- Synchronous Audio Conversion ---
def convert_audio_sync(audio_chunk_bytes: bytes) -> np.ndarray | None:
    """
    Synchronous function to convert audio bytes to PCM float32 at 16kHz via ffmpeg.
    Run in the executor.
    """
    logger.debug(f"Starting FFmpeg conversion for chunk size: {len(audio_chunk_bytes)}")
    try:
        command = [
            'ffmpeg',
            '-f', 'webm',           # Specify expected input format (WebM container)
            '-i', 'pipe:0',          # Read input from stdin
            '-f', 'f32le',           # Output format: PCM float32 little-endian
            '-acodec', 'pcm_f32le',  # Explicit output codec
            '-ar', '16000',          # Sampling rate: 16kHz
            '-ac', '1',              # Channels: Mono
            '-loglevel', 'error',    # Only show ffmpeg errors
            'pipe:1'                 # Write output to stdout
        ]
        process = subprocess.run(
            command,
            input=audio_chunk_bytes,
            capture_output=True,
            check=False
        )
        if process.returncode == 0:
            if not process.stdout:
                logger.warning("FFmpeg conversion successful but produced empty output.")
                return None
            logger.debug(f"FFmpeg conversion successful, output size: {len(process.stdout)}")
            return np.frombuffer(process.stdout, dtype=np.float32)
        else:
            logger.error(f"FFmpeg conversion failed (code {process.returncode}): {process.stderr.decode().strip()}")
            return None
    except FileNotFoundError:
         logger.error("ffmpeg command not found. Ensure ffmpeg is installed and in PATH within the container?")
         return None
    except Exception as e:
         logger.exception(f"Unexpected error during audio conversion: {e}")
         return None

# --- Transcription Processing ---
async def process_audio_chunk(audio_chunk: bytes) -> str:
    """Process an audio chunk using the Faster Whisper model."""
    global models, ml_executor
    if 'whisper' not in models:
        logger.error("Faster Whisper model not loaded for processing.")
        return "[Whisper Error: Model not loaded]"
    if not ml_executor:
        logger.error("ML executor not available.")
        return "[System Error: Executor missing]"

    logger.debug(f"Received audio chunk of size: {len(audio_chunk)} bytes for transcription")

    try:
        # 1. Audio conversion
        audio_np = await asyncio.get_event_loop().run_in_executor(
            ml_executor,
            convert_audio_sync,
            audio_chunk
        )
        if audio_np is None or audio_np.size == 0:
            logger.warning("Audio conversion failed or produced empty data.")
            return ""
        
        # 2. Transcription using Faster Whisper in the executor
        whisper_model = models['whisper']
        segments, _ = await asyncio.get_event_loop().run_in_executor(
            ml_executor,
            lambda: list(whisper_model.transcribe(audio_np, beam_size=5))
        )
        # Updated: use the attribute access instead of dict methods.
        transcription = " ".join(seg.text.strip() for seg in segments if seg.text).strip()

        if transcription:
            logger.info(f"Faster Whisper transcription: '{transcription}'")
        else:
            logger.debug("No transcription generated for this chunk.")

        return transcription

    except Exception as e:
        logger.error(f"Error during Faster Whisper transcription: {e}", exc_info=True)
        return "[Transcription Error]"

# --- Translation Processing ---
async def translate_text_async(text: str) -> str:
    """Translate text asynchronously using the executor."""
    global models, ml_executor
    if not text:
        return ""
    if 'translator' not in models or not ml_executor:
        logger.error("Translator model or executor not available.")
        return "[Translator Error]"

    logger.debug(f"Attempting to translate: '{text}'")
    try:
        translator_pipeline = models['translator']
        result = await asyncio.get_event_loop().run_in_executor(
            ml_executor,
            translator_pipeline,
            text
        )
        logger.debug(f"Raw translation result: {json.dumps(result, indent=2)}")
        if result and isinstance(result, list) and len(result) > 0 and isinstance(result[0], dict) and 'translation_text' in result[0]:
             translation = result[0]['translation_text']
             logger.info(f"Successfully translated '{text}' to '{translation}'")
             return translation
        else:
             logger.warning(f"Unexpected translation result format for '{text}': {result}")
             return "[Translation Format Error]"
    except Exception as e:
        logger.error(f"Error during translation pipeline for '{text}': {e}", exc_info=True)
        return "[Translation Pipeline Error]"
