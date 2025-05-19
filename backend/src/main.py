# src/main.py
import asyncio
import logging
import os
# Remove unused numpy/subprocess if not needed elsewhere
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# Keep Whisper model loading if still needed for STT
from faster_whisper import WhisperModel

# --- Configuration (Keep existing logging setup) ---
try:
    import src.core.config
    logger = logging.getLogger(__name__)
except ImportError:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    logger = logging.getLogger(__name__)


# --- Locate ffmpeg (Keep if STT feature is used) ---
FFMPEG_PATH = os.getenv("FFMPEG_PATH", "ffmpeg")
logger.info(f"Using ffmpeg command: '{FFMPEG_PATH}'") # Only relevant if STT is active

# --- Load the Faster Whisper model (Keep if STT feature is used) ---
MODEL_NAME = os.getenv("WHISPER_MODEL", "ctranslate2-4you/whisper-base.en-ct2-int8_bfloat16")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
# Translated log message
logger.info(f"Loading Faster Whisper model '{MODEL_NAME}' on device '{DEVICE}'...")
model = None # Initialize model as None
try:
    # Only load if STT feature might be used
    # Consider loading models conditionally based on enabled features if memory is a concern
    model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type="int8")
    # Translated log message
    logger.info("Faster Whisper model loaded successfully.")
except Exception as model_load_err:
     # Translated log message
     logger.exception(f"CRITICAL ERROR: Failed to load Faster Whisper model '{MODEL_NAME}': {model_load_err}")
     # model remains None


# --- FastAPI and CORS configuration ---
app = FastAPI(title="AI Services API") # Already English

origins = [
    "http://localhost",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Include Routers ---

# Include STT router (keep if needed)
from src.features.stt.router import router as stt_router
app.include_router(stt_router, prefix="/api/stt", tags=["Speech-to-Text"]) # Tag already English

from src.features.mistral.router import router as mistral_router
app.include_router(mistral_router, prefix="/api/mistral", tags=["Chat"])

