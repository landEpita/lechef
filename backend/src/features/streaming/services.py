# src/features/streaming/services.py
import logging
import asyncio
import json # Pour affichage des logs
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from transformers import pipeline
# --- Import pour Whisper ---
from faster_whisper import WhisperModel # Utilisation de faster-whisper
import ffmpeg # Import pour ffmpeg-python (si utilisé dans la conversion)
import subprocess # Alternative pour appeler ffmpeg

# --- Configuration (Mettre dans core.config idéalement) ---
WHISPER_MODEL_NAME = "tiny.en" # ou "base.en" pour CPU temps-réel
TRANSLATION_MODEL_NAME = "Helsinki-NLP/opus-mt-en-fr"
DEVICE = "cpu"
COMPUTE_TYPE = "int8" # Quantization pour CPU
NUM_ML_WORKERS = 4 # Ajuster

logger = logging.getLogger(__name__)

# --- Gestionnaire de Threads & Modèles ---
try:
    # Créer le pool de threads pour les tâches bloquantes (ML, ffmpeg)
    ml_executor = ThreadPoolExecutor(max_workers=NUM_ML_WORKERS, thread_name_prefix="MLWorker")
    models = {} # Dictionnaire pour les modèles chargés
except Exception as e:
    logger.exception("Failed to create ThreadPoolExecutor")
    ml_executor = None
    models = {}

# --- Chargement/Nettoyage Modèles ---
def load_models():
    """Charge les modèles ML nécessaires."""
    global models
    logger.info(f"Loading models... Device: {DEVICE}, ComputeType: {COMPUTE_TYPE}")
    if not ml_executor:
        logger.error("Cannot load models, ML executor not available.")
        return
    try:
        # === Chargement Faster Whisper ===
        logger.info(f"Loading faster-whisper model: {WHISPER_MODEL_NAME}")
        models['whisper'] = WhisperModel(WHISPER_MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
        logger.info(f"Faster-whisper model '{WHISPER_MODEL_NAME}' loaded.")

        # === Chargement Traducteur ===
        logger.info(f"Loading translation model: {TRANSLATION_MODEL_NAME}")
        models['translator'] = pipeline(
            "translation_en_to_fr", model=TRANSLATION_MODEL_NAME, device=-1 # -1 force CPU pour pipeline
        )
        logger.info(f"Translation model '{TRANSLATION_MODEL_NAME}' loaded.")

    except Exception as e:
        logger.exception(f"CRITICAL: Error loading ML models: {e}")
        # Gérer l'échec du chargement (peut-être arrêter l'application?)
        raise RuntimeError("Failed to load essential ML models") from e

def cleanup_models():
    """Nettoie les ressources."""
    global models, ml_executor
    logger.info("Shutting down ML executor and cleaning up models...")
    models.clear()
    if ml_executor:
        ml_executor.shutdown(wait=True)
        logger.info("ML executor shut down.")

# --- Conversion Audio (Implémentation Corrigée) ---
def convert_audio_sync(audio_chunk_bytes: bytes) -> np.ndarray | None:
    """
    Fonction SYNCHRONE pour convertir les bytes audio en PCM float32 16kHz via ffmpeg.
    Exécuter cette fonction dans l'executor.
    """
    logger.debug(f"Starting FFmpeg conversion for chunk size: {len(audio_chunk_bytes)}")
    try:
        command = [
            'ffmpeg',
            # --- AJOUT CRUCIAL ICI ---
            '-f', 'webm',           # Spécifier le format d'entrée attendu (conteneur WebM)
            # --------------------------
            '-i', 'pipe:0',          # Lire depuis stdin
            '-f', 'f32le',           # Format de sortie: PCM 32-bit float little-endian
            '-acodec', 'pcm_f32le',  # Codec de sortie explicite
            '-ar', '16000',          # Taux d'échantillonnage: 16kHz
            '-ac', '1',              # Nombre de canaux: Mono
            '-loglevel', 'error',    # N'afficher que les erreurs ffmpeg
            'pipe:1'                 # Écrire sur stdout
        ]
        # Exécuter ffmpeg comme un sous-processus synchrone
        process = subprocess.run(
            command,
            input=audio_chunk_bytes, # Fournir le chunk audio à ffmpeg via stdin
            capture_output=True,     # Capturer stdout et stderr
            check=False              # Ne pas lever d'exception si ffmpeg retourne une erreur
        )

        if process.returncode == 0:
            # Vérifier si la sortie n'est pas vide
            if not process.stdout:
                logger.warning("FFmpeg conversion successful but produced empty output.")
                return None # Considérer comme un échec si sortie vide
            logger.debug(f"FFmpeg conversion successful, output size: {len(process.stdout)}")
            # Convertir les bytes de sortie en NumPy array
            return np.frombuffer(process.stdout, dtype=np.float32)
        else:
            # Logguer l'erreur de ffmpeg
            logger.error(f"FFmpeg conversion failed (code {process.returncode}): {process.stderr.decode().strip()}") # .strip() pour nettoyer
            return None

    except FileNotFoundError:
         logger.error("ffmpeg command not found. Is ffmpeg installed and in PATH within the container?")
         return None
    except Exception as e:
         logger.exception(f"Unexpected error during audio conversion: {e}")
         return None



# --- Traitement Transcription ---
async def process_audio_chunk(audio_chunk: bytes) -> str:
    """Traite un chunk audio avec le modèle Whisper chargé."""
    global models, ml_executor
    if 'whisper' not in models:
        logger.error("Whisper model not loaded for processing.")
        return "[Whisper Error: Model not loaded]"
    if not ml_executor:
        logger.error("ML executor not available.")
        return "[System Error: Executor missing]"

    logger.debug(f"Received audio chunk size: {len(audio_chunk)} bytes for transcription")

    try:
        # 1. Convertir l'audio DANS L'EXECUTOR car ffmpeg/conversion est bloquant
        audio_np = await asyncio.get_event_loop().run_in_executor(
             ml_executor,          # Utiliser le pool de threads
             convert_audio_sync,   # La fonction *synchrone* de conversion
             audio_chunk           # L'argument pour la fonction
         )

        if audio_np is None or audio_np.size == 0:
            logger.warning("Audio conversion failed or resulted in empty data.")
            # Il est important de retourner "" ici pour que le reste fonctionne
            return "" # Pas de transcription si conversion échoue

        # 2. Exécuter Whisper (bloquant) dans l'executor
        whisper_model: WhisperModel = models['whisper']

        # Utilisation de transcribe pour traiter le chunk converti
        # Pour un vrai streaming segment par segment, une logique plus complexe est nécessaire
        segments, info = await asyncio.get_event_loop().run_in_executor(
             ml_executor,
             whisper_model.transcribe,
             audio_np,
             beam_size=5 # Paramètre faster-whisper (ajustable)
             # language='en' # Optionnel: si vous connaissez la langue d'entrée
         )

        # Concaténer les segments (peut y en avoir plusieurs même pour un chunk)
        transcription = " ".join([segment.text for segment in segments]).strip()

        # Log seulement si une transcription est trouvée
        if transcription:
             logger.info(f"Whisper transcription: '{transcription}' (Lang: {info.language} Prob: {info.language_probability:.2f})")
        else:
             logger.debug("Whisper produced no transcription for this chunk.")

        return transcription

    except Exception as e:
        logger.error(f"Error during Whisper processing pipeline: {e}", exc_info=True)
        return "[Transcription Error]"

# --- Traitement Traduction ---
async def translate_text_async(text: str) -> str:
    """Traduit le texte de manière asynchrone en utilisant l'executor."""
    global models, ml_executor
    if not text:
        return "" # Ne rien faire si pas de texte
    if 'translator' not in models or not ml_executor:
        logger.error("Translator model or executor not available.")
        return "[Translator Error]"

    logger.debug(f"Attempting to translate: '{text}'")
    try:
        translator_pipeline = models['translator']
        # Exécuter dans le thread pool
        result = await asyncio.get_event_loop().run_in_executor(
            ml_executor,
            translator_pipeline,
            text
        )

        logger.debug(f"Raw translation result: {json.dumps(result, indent=2)}")

        # Extraction plus sûre
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