"""
Model Manager - Gestiona descarga, instalacion y eliminacion de todos los modelos
Incluye: Chatterbox TTS, Faster-Whisper STT, Kokoro TTS, Traduccion, etc.
"""

import os
import shutil
import asyncio
from pathlib import Path
from typing import Dict, List, Optional, Callable, Any, Union
from dataclasses import dataclass, field
from enum import Enum
import threading
import json

from huggingface_hub import scan_cache_dir, snapshot_download, hf_hub_download
from huggingface_hub.constants import HUGGINGFACE_HUB_CACHE
from huggingface_hub.utils import HfHubHTTPError
import requests

from settings_service import settings_service
from app_paths import get_models_dir


def _get_user_friendly_error(error: Exception, model_name: str = "") -> str:
    """
    Convert technical errors into user-friendly messages.
    """
    error_str = str(error).lower()

    # Check for HuggingFace HTTP errors
    if isinstance(error, HfHubHTTPError) or "hfhubhttperror" in error_str:
        if "401" in error_str or "unauthorized" in error_str:
            return (
                f"Authentication required for {model_name or 'this model'}. "
                "Please configure your HuggingFace token in Settings -> API Keys."
            )
        if "403" in error_str or "forbidden" in error_str:
            return (
                f"Access denied for {model_name or 'this model'}. "
                "You may need to accept the model's license agreement on HuggingFace, "
                "or your token may not have the required permissions."
            )
        if "404" in error_str or "not found" in error_str:
            return (
                f"Model {model_name or ''} not found on HuggingFace. "
                "The model may have been removed or the repository name has changed."
            )
        if "503" in error_str or "service unavailable" in error_str:
            return (
                "HuggingFace servers are temporarily unavailable. "
                "Please try again in a few minutes."
            )
        if "429" in error_str or "rate limit" in error_str or "too many requests" in error_str:
            return (
                "Too many download requests. "
                "Please wait a few minutes before trying again."
            )

    # Check for requests HTTP errors
    if isinstance(error, requests.exceptions.HTTPError):
        status_code = getattr(error.response, 'status_code', None) if hasattr(error, 'response') else None
        if status_code == 401:
            return f"Authentication required for {model_name or 'this model'}."
        if status_code == 403:
            return f"Access denied for {model_name or 'this model'}."
        if status_code == 404:
            return f"Model {model_name or ''} not found."
        if status_code == 503:
            return "Server temporarily unavailable. Please try again later."

    # Check for connection errors
    if "connection" in error_str or "timeout" in error_str:
        return (
            "Unable to connect to download server. "
            "Please check your internet connection and try again."
        )

    # Check for disk space errors
    if "no space" in error_str or "disk full" in error_str or "oserror" in error_str:
        return (
            "Not enough disk space to download the model. "
            "Please free up some space and try again."
        )

    # Check for permission errors
    if "permission" in error_str:
        return (
            "Unable to write to the models directory. "
            "Please check folder permissions."
        )

    # Check for gated model errors
    if "gated" in error_str or "agreement" in error_str:
        return (
            f"This model requires accepting the license agreement on HuggingFace. "
            "Please visit the model page on HuggingFace, accept the terms, "
            "then configure your HuggingFace token in Settings."
        )

    # Default: return original error but cleaned up
    return str(error)

# Directorios
MODELS_DIR = get_models_dir()
HF_CACHE_DIR = Path(HUGGINGFACE_HUB_CACHE)


class ModelCategory(str, Enum):
    TTS = "tts"              # Text to Speech (Chatterbox, Kokoro)
    STT = "stt"              # Speech to Text (Faster-Whisper)
    DIARIZATION = "diarization"  # Speaker Diarization (Pyannote)
    TRANSLATION = "translation"  # Traduccion (Argos)
    AI = "ai"                # IA local (Ollama)


class ModelStatus(str, Enum):
    NOT_INSTALLED = "not_installed"
    DOWNLOADING = "downloading"
    INSTALLED = "installed"
    ERROR = "error"


@dataclass
class ModelInfo:
    """Informacion de un modelo"""
    id: str
    name: str
    category: ModelCategory
    description: str
    size_mb: int
    repo_id: Optional[str] = None        # Hugging Face repo
    download_url: Optional[str] = None   # URL directa
    files: Optional[List[str]] = None    # Archivos especificos a descargar
    shared_with: Optional[str] = None    # Comparte repo con otro modelo
    languages: List[str] = field(default_factory=lambda: ["en"])
    provider: str = "local"
    requires_gpu: bool = False
    is_default: bool = False
    is_chatterbox: bool = False          # Modelo de Chatterbox original
    uses_hf_cache: bool = False          # Modelo que usa cache de HuggingFace (descargado por libreria externa)


# ===============================
# REGISTRO DE TODOS LOS MODELOS
# ===============================

AVAILABLE_MODELS: Dict[str, ModelInfo] = {
    # -------------------------
    # Chatterbox TTS Models
    # -------------------------
    "chatterbox-original": ModelInfo(
        id="chatterbox-original",
        name="Chatterbox Original",
        category=ModelCategory.TTS,
        description="500M model with creative controls (English only)",
        size_mb=2000,
        repo_id="ResembleAI/chatterbox",
        files=["ve.safetensors", "t3_cfg.safetensors", "s3gen.safetensors", "tokenizer.json", "conds.pt"],
        languages=["en"],
        is_default=True,
        is_chatterbox=True
    ),
    "chatterbox-turbo": ModelInfo(
        id="chatterbox-turbo",
        name="Chatterbox Turbo",
        category=ModelCategory.TTS,
        description="350M fast model with paralinguistic tags (English only)",
        size_mb=1500,
        repo_id="ResembleAI/chatterbox-turbo",
        languages=["en"],
        is_chatterbox=True
    ),
    "chatterbox-multilingual": ModelInfo(
        id="chatterbox-multilingual",
        name="Chatterbox Multilingual",
        category=ModelCategory.TTS,
        description="500M model supporting 23 languages",
        size_mb=2000,
        repo_id="ResembleAI/chatterbox",
        shared_with="chatterbox-original",
        languages=["multilingual"],
        is_chatterbox=True
    ),

    # -------------------------
    # Kokoro TTS - Variantes por tamaño
    # -------------------------
    "kokoro-82m": ModelInfo(
        id="kokoro-82m",
        name="Kokoro 82M (Pequeño)",
        category=ModelCategory.TTS,
        description="TTS ultra-rapido. 82M params. ~1GB VRAM. 54 voces preset.",
        size_mb=170,
        repo_id="hexgrad/Kokoro-82M",
        languages=["en", "es", "fr", "ja", "ko", "zh"],
        is_default=False,
        uses_hf_cache=True
    ),

    # -------------------------
    # F5-TTS - Variantes
    # -------------------------
    "f5-tts-base": ModelInfo(
        id="f5-tts-base",
        name="F5-TTS Base",
        category=ModelCategory.TTS,
        description="Voice cloning alta calidad. ~6GB VRAM. Multilenguaje.",
        size_mb=2500,
        repo_id="SWivid/F5-TTS",
        languages=["en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),
    "f5-tts-spanish": ModelInfo(
        id="f5-tts-spanish",
        name="F5-TTS Spanish",
        category=ModelCategory.TTS,
        description="Fine-tuned para espanol. Mejor calidad espanol. ~6GB VRAM.",
        size_mb=2500,
        repo_id="jpgallegoar/F5-Spanish",
        languages=["es"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),
    "e2-tts-base": ModelInfo(
        id="e2-tts-base",
        name="E2-TTS Base",
        category=ModelCategory.TTS,
        description="Variante E2 de F5-TTS. Diferente arquitectura. ~5GB VRAM.",
        size_mb=2000,
        repo_id="SWivid/E2-TTS",
        languages=["en", "zh"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),

    # -------------------------
    # Orpheus TTS - Variantes por tamaño (canopylabs)
    # -------------------------
    "orpheus-3b": ModelInfo(
        id="orpheus-3b",
        name="Orpheus 3B (Grande)",
        category=ModelCategory.TTS,
        description="Modelo completo 3B params. Maxima calidad. ~12GB VRAM.",
        size_mb=6000,
        repo_id="canopylabs/orpheus-3b-0.1-ft",
        languages=["en", "es", "fr", "de", "zh", "hi", "ko"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),

    # -------------------------
    # Fish-Speech TTS
    # -------------------------
    "fish-speech-1.4": ModelInfo(
        id="fish-speech-1.4",
        name="Fish-Speech 1.4",
        category=ModelCategory.TTS,
        description="TTS multilenguaje con voice cloning. ~4GB VRAM. Excelente espanol.",
        size_mb=1500,
        repo_id="fishaudio/fish-speech-1.4",
        languages=["en", "es", "fr", "de", "zh", "ja", "ko", "ar", "pt", "it", "ru"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),
    "fish-speech-1.5": ModelInfo(
        id="fish-speech-1.5",
        name="Fish-Speech 1.5 (Preview)",
        category=ModelCategory.TTS,
        description="Version preview con mejoras experimentales. ~4.5GB VRAM.",
        size_mb=1800,
        repo_id="fishaudio/fish-speech-1.5",
        languages=["en", "es", "fr", "de", "zh", "ja", "ko", "ar", "pt", "it", "ru"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),

    # -------------------------
    # OpenVoice V2 TTS
    # -------------------------
    "openvoice-v2": ModelInfo(
        id="openvoice-v2",
        name="OpenVoice V2",
        category=ModelCategory.TTS,
        description="Voice cloning cross-lingual de MyShell/MIT. ~3GB VRAM. Clona voz y habla en cualquier idioma.",
        size_mb=1200,
        repo_id="myshell-ai/OpenVoice",
        languages=["en", "es", "fr", "de", "zh", "ja", "ko", "it", "pt"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),

    # -------------------------
    # Zonos TTS (Zyphra)
    # -------------------------
    "zonos-hybrid": ModelInfo(
        id="zonos-hybrid",
        name="Zonos Hybrid",
        category=ModelCategory.TTS,
        description="TTS de Zyphra con voice cloning. ~6GB VRAM. Balance calidad/velocidad.",
        size_mb=2500,
        repo_id="Zyphra/Zonos-v0.1-hybrid",
        languages=["en", "es", "fr", "de", "zh", "ja", "ko", "it", "pt"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),
    "zonos-transformer": ModelInfo(
        id="zonos-transformer",
        name="Zonos Transformer",
        category=ModelCategory.TTS,
        description="Zonos full transformer. ~7GB VRAM. Maxima calidad.",
        size_mb=3000,
        repo_id="Zyphra/Zonos-v0.1-transformer",
        languages=["en", "es", "fr", "de", "zh", "ja", "ko", "it", "pt"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),

    # -------------------------
    # VibeVoice TTS
    # -------------------------
    "vibevoice-0.5b": ModelInfo(
        id="vibevoice-0.5b",
        name="VibeVoice 0.5B",
        category=ModelCategory.TTS,
        description="TTS ligero con voice cloning. ~2.5GB VRAM. Experimental espanol.",
        size_mb=1000,
        repo_id="vibevoice/vibevoice-0.5b",
        languages=["en", "es", "fr", "de", "zh", "ja", "ko"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),

    # -------------------------
    # VoxCPM TTS (OpenBMB)
    # -------------------------
    "voxcpm-base": ModelInfo(
        id="voxcpm-base",
        name="VoxCPM Base",
        category=ModelCategory.TTS,
        description="Voice cloning de OpenBMB. ~4GB VRAM. Ingles y chino.",
        size_mb=2000,
        repo_id="openbmb/VoxCPM",
        languages=["en", "zh"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),
    "voxcpm-large": ModelInfo(
        id="voxcpm-large",
        name="VoxCPM Large",
        category=ModelCategory.TTS,
        description="VoxCPM modelo grande. ~6GB VRAM. Mejor calidad.",
        size_mb=3500,
        repo_id="openbmb/VoxCPM-large",
        languages=["en", "zh"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),

    # -------------------------
    # Dia TTS (Nari Labs)
    # -------------------------
    "dia-1.6b": ModelInfo(
        id="dia-1.6b",
        name="Dia 1.6B",
        category=ModelCategory.TTS,
        description="TTS de dialogo con emociones de Nari Labs. ~8GB VRAM. Solo ingles. Tags [S1]/[S2].",
        size_mb=3500,
        repo_id="nari-labs/Dia-1.6B",
        languages=["en"],
        requires_gpu=True,
        is_default=False,
        uses_hf_cache=True
    ),

    # -------------------------
    # Faster-Whisper STT Models
    # -------------------------
    "faster-whisper-tiny": ModelInfo(
        id="faster-whisper-tiny",
        name="Faster-Whisper Tiny",
        category=ModelCategory.STT,
        description="Modelo muy rapido, precision basica. Ideal para pruebas.",
        size_mb=39,
        repo_id="Systran/faster-whisper-tiny",
        languages=["multilingual"]
    ),
    "faster-whisper-base": ModelInfo(
        id="faster-whisper-base",
        name="Faster-Whisper Base",
        category=ModelCategory.STT,
        description="Balance entre velocidad y precision. Recomendado para empezar.",
        size_mb=74,
        repo_id="Systran/faster-whisper-base",
        languages=["multilingual"],
        is_default=True
    ),
    "faster-whisper-small": ModelInfo(
        id="faster-whisper-small",
        name="Faster-Whisper Small",
        category=ModelCategory.STT,
        description="Buena precision, velocidad moderada.",
        size_mb=244,
        repo_id="Systran/faster-whisper-small",
        languages=["multilingual"]
    ),
    "faster-whisper-medium": ModelInfo(
        id="faster-whisper-medium",
        name="Faster-Whisper Medium",
        category=ModelCategory.STT,
        description="Alta precision, requiere mas recursos.",
        size_mb=769,
        repo_id="Systran/faster-whisper-medium",
        languages=["multilingual"],
        requires_gpu=True
    ),
    "faster-whisper-large-v3": ModelInfo(
        id="faster-whisper-large-v3",
        name="Faster-Whisper Large V3",
        category=ModelCategory.STT,
        description="Maxima precision, requiere GPU potente.",
        size_mb=1550,
        repo_id="Systran/faster-whisper-large-v3",
        languages=["multilingual"],
        requires_gpu=True
    ),
    "faster-distil-whisper-large-v3": ModelInfo(
        id="faster-distil-whisper-large-v3",
        name="Distil-Whisper Large V3",
        category=ModelCategory.STT,
        description="Casi igual precision que Large, pero mas rapido.",
        size_mb=756,
        repo_id="Systran/faster-distil-whisper-large-v3",
        languages=["multilingual"],
        requires_gpu=True
    ),

    # -------------------------
    # Speaker Diarization Models
    # -------------------------
    "pyannote-diarization": ModelInfo(
        id="pyannote-diarization",
        name="Pyannote Speaker Diarization",
        category=ModelCategory.DIARIZATION,
        description="Identificacion de hablantes con IA. Requiere aceptar terminos en HuggingFace y token HF_TOKEN.",
        size_mb=600,
        repo_id="pyannote/speaker-diarization-3.1",
        languages=["multilingual"],
        requires_gpu=True
    ),
    "pyannote-segmentation": ModelInfo(
        id="pyannote-segmentation",
        name="Pyannote Segmentation",
        category=ModelCategory.DIARIZATION,
        description="Modelo de segmentacion para diarizacion (requerido por pyannote-diarization).",
        size_mb=200,
        repo_id="pyannote/segmentation-3.0",
        languages=["multilingual"],
        requires_gpu=True
    ),

    # -------------------------
    # Translation Models
    # -------------------------
    "argos-es-en": ModelInfo(
        id="argos-es-en",
        name="Argos Spanish -> English",
        category=ModelCategory.TRANSLATION,
        description="Local translation Spanish to English.",
        size_mb=100,
        languages=["es", "en"]
    ),
    "argos-en-es": ModelInfo(
        id="argos-en-es",
        name="Argos English -> Spanish",
        category=ModelCategory.TRANSLATION,
        description="Local translation English to Spanish.",
        size_mb=100,
        languages=["en", "es"]
    ),
    "argos-fr-en": ModelInfo(
        id="argos-fr-en",
        name="Argos French -> English",
        category=ModelCategory.TRANSLATION,
        description="Local translation French to English.",
        size_mb=100,
        languages=["fr", "en"]
    ),
    "argos-en-fr": ModelInfo(
        id="argos-en-fr",
        name="Argos English -> French",
        category=ModelCategory.TRANSLATION,
        description="Local translation English to French.",
        size_mb=100,
        languages=["en", "fr"]
    ),
    "argos-de-en": ModelInfo(
        id="argos-de-en",
        name="Argos German -> English",
        category=ModelCategory.TRANSLATION,
        description="Local translation German to English.",
        size_mb=100,
        languages=["de", "en"]
    ),
    "argos-en-de": ModelInfo(
        id="argos-en-de",
        name="Argos English -> German",
        category=ModelCategory.TRANSLATION,
        description="Local translation English to German.",
        size_mb=100,
        languages=["en", "de"]
    ),
    "argos-pt-en": ModelInfo(
        id="argos-pt-en",
        name="Argos Portuguese -> English",
        category=ModelCategory.TRANSLATION,
        description="Local translation Portuguese to English.",
        size_mb=100,
        languages=["pt", "en"]
    ),
    "argos-en-pt": ModelInfo(
        id="argos-en-pt",
        name="Argos English -> Portuguese",
        category=ModelCategory.TRANSLATION,
        description="Local translation English to Portuguese.",
        size_mb=100,
        languages=["en", "pt"]
    ),
    "argos-it-en": ModelInfo(
        id="argos-it-en",
        name="Argos Italian -> English",
        category=ModelCategory.TRANSLATION,
        description="Local translation Italian to English.",
        size_mb=100,
        languages=["it", "en"]
    ),
    "argos-en-it": ModelInfo(
        id="argos-en-it",
        name="Argos English -> Italian",
        category=ModelCategory.TRANSLATION,
        description="Local translation English to Italian.",
        size_mb=100,
        languages=["en", "it"]
    ),
    "argos-zh-en": ModelInfo(
        id="argos-zh-en",
        name="Argos Chinese -> English",
        category=ModelCategory.TRANSLATION,
        description="Local translation Chinese to English.",
        size_mb=100,
        languages=["zh", "en"]
    ),
    "argos-en-zh": ModelInfo(
        id="argos-en-zh",
        name="Argos English -> Chinese",
        category=ModelCategory.TRANSLATION,
        description="Local translation English to Chinese.",
        size_mb=100,
        languages=["en", "zh"]
    ),
    "argos-ja-en": ModelInfo(
        id="argos-ja-en",
        name="Argos Japanese -> English",
        category=ModelCategory.TRANSLATION,
        description="Local translation Japanese to English.",
        size_mb=100,
        languages=["ja", "en"]
    ),
    "argos-en-ja": ModelInfo(
        id="argos-en-ja",
        name="Argos English -> Japanese",
        category=ModelCategory.TRANSLATION,
        description="Local translation English to Japanese.",
        size_mb=100,
        languages=["en", "ja"]
    ),
    "argos-ru-en": ModelInfo(
        id="argos-ru-en",
        name="Argos Russian -> English",
        category=ModelCategory.TRANSLATION,
        description="Local translation Russian to English.",
        size_mb=100,
        languages=["ru", "en"]
    ),
    "argos-en-ru": ModelInfo(
        id="argos-en-ru",
        name="Argos English -> Russian",
        category=ModelCategory.TRANSLATION,
        description="Local translation English to Russian.",
        size_mb=100,
        languages=["en", "ru"]
    ),
}


@dataclass
class DownloadProgress:
    """Tracking de progreso de descarga"""
    model_id: str
    total_bytes: int
    downloaded_bytes: int = 0
    status: ModelStatus = ModelStatus.DOWNLOADING
    error: Optional[str] = None

    @property
    def progress_percent(self) -> float:
        if self.total_bytes == 0:
            return 0
        return min(100, (self.downloaded_bytes / self.total_bytes) * 100)


class ModelManager:
    """Gestor unificado de todos los modelos"""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._downloads: Dict[str, DownloadProgress] = {}
        self._download_callbacks: Dict[str, List[Callable]] = {}

        # Asegurar directorios
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        for category in ModelCategory:
            (MODELS_DIR / category.value).mkdir(exist_ok=True)

    def _get_hf_cache_status(
        self,
        model: ModelInfo,
        downloaded_repos: Dict[str, float],
    ) -> tuple[bool, float, float]:
        """Return (installed, size_gb, completeness) for HF cache-backed models."""
        if not model.repo_id:
            return False, 0.0, 0.0

        if model.repo_id not in downloaded_repos:
            return False, 0.0, 0.0

        actual_size_gb = downloaded_repos[model.repo_id]
        expected_size_gb = model.size_mb / 1024

        if expected_size_gb <= 0.1:
            return True, actual_size_gb, 1.0

        completeness = actual_size_gb / expected_size_gb if expected_size_gb else 0.0
        if completeness >= 0.7:
            return True, actual_size_gb, completeness

        if settings_service.is_model_installed(model.id):
            return True, actual_size_gb, completeness

        return False, actual_size_gb, completeness

    # ===============================
    # CONSULTAS
    # ===============================

    def get_model_info(self, model_id: str) -> Optional[ModelInfo]:
        """Obtener informacion de un modelo"""
        return AVAILABLE_MODELS.get(model_id)

    def list_available_models(self, category: Optional[ModelCategory] = None) -> List[ModelInfo]:
        """Listar modelos disponibles"""
        models = list(AVAILABLE_MODELS.values())
        if category:
            models = [m for m in models if m.category == category]
        return models

    def list_installed_models(self, category: Optional[ModelCategory] = None) -> List[Dict]:
        """Listar modelos instalados con su estado"""
        result = []

        # Models in HF cache (Chatterbox, F5-TTS, Kokoro, Orpheus, etc.)
        downloaded_repos = self._scan_hf_cache()

        for model_id, model in AVAILABLE_MODELS.items():
            is_installed = False
            downloaded_size = 0

            if (model.is_chatterbox or model.uses_hf_cache) and model.repo_id:
                # Check HF cache for models that use it
                is_installed, downloaded_size, _ = self._get_hf_cache_status(model, downloaded_repos)
            else:
                # Check local models dir or settings
                is_installed = settings_service.is_model_installed(model_id)

            if is_installed:
                if category is None or model.category == category:
                    result.append({
                        "id": model_id,
                        "name": model.name,
                        "category": model.category.value,
                        "size_mb": model.size_mb,
                        "downloaded_size_mb": int(downloaded_size * 1024) if downloaded_size else model.size_mb
                    })

        return result

    def is_installed(self, model_id: str) -> bool:
        """Verificar si un modelo esta instalado"""
        model = AVAILABLE_MODELS.get(model_id)
        if not model:
            return False

        if (model.is_chatterbox or model.uses_hf_cache) and model.repo_id:
            downloaded_repos = self._scan_hf_cache()
            is_installed, _, _ = self._get_hf_cache_status(model, downloaded_repos)
            return is_installed

        return settings_service.is_model_installed(model_id)

    def get_model_status(self, model_id: str) -> ModelStatus:
        """Obtener estado de un modelo"""
        if model_id in self._downloads:
            return self._downloads[model_id].status
        if self.is_installed(model_id):
            return ModelStatus.INSTALLED
        return ModelStatus.NOT_INSTALLED

    def get_download_progress(self, model_id: str) -> Optional[DownloadProgress]:
        """Obtener progreso de descarga"""
        return self._downloads.get(model_id)

    def get_model_path(self, model_id: str) -> Optional[Path]:
        """Obtener path del modelo"""
        model = AVAILABLE_MODELS.get(model_id)
        if not model:
            return None

        if model.is_chatterbox or model.uses_hf_cache:
            # Models using HF cache
            return HF_CACHE_DIR

        return MODELS_DIR / model.category.value / model_id

    # ===============================
    # DESCARGA
    # ===============================

    def download_model(self, model_id: str, progress_callback: Callable = None) -> bool:
        """
        Descargar un modelo (version sincrona).
        Retorna True si fue exitoso.
        """
        model = AVAILABLE_MODELS.get(model_id)
        if not model:
            raise ValueError(f"Modelo desconocido: {model_id}")

        if self.is_installed(model_id):
            return True

        # Iniciar tracking
        total_bytes = model.size_mb * 1024 * 1024
        progress = DownloadProgress(model_id=model_id, total_bytes=total_bytes)
        self._downloads[model_id] = progress

        try:
            if model.is_chatterbox or model.uses_hf_cache:
                # Download to HF cache (Chatterbox, F5-TTS, Kokoro, Orpheus, etc.)
                success = self._download_to_hf_cache(model, progress, progress_callback)
            elif model.repo_id:
                success = self._download_from_hf(model, progress, progress_callback)
            elif model.download_url:
                success = self._download_from_url(model, progress, progress_callback)
            elif model.category == ModelCategory.TRANSLATION:
                success = self._download_argos(model, progress, progress_callback)
            else:
                success = False

            if success:
                progress.status = ModelStatus.INSTALLED
                if not model.is_chatterbox:
                    settings_service.add_installed_model(model_id)
            else:
                progress.status = ModelStatus.ERROR

            return success

        except Exception as e:
            progress.status = ModelStatus.ERROR
            progress.error = str(e)
            raise

        finally:
            if progress_callback:
                progress_callback(progress.progress_percent)

    def _download_to_hf_cache(self, model: ModelInfo, progress: DownloadProgress, callback: Callable = None) -> bool:
        """Descargar modelo al cache de HuggingFace (Chatterbox, F5-TTS, Kokoro, Orpheus, etc.)"""
        import time

        # Track download completion status
        download_complete = threading.Event()
        download_error = [None]  # Use list to allow modification in thread

        def poll_cache_size():
            """Poll the cache size during download to track progress"""
            last_pct = 0
            while not download_complete.is_set():
                try:
                    downloaded_repos = self._scan_hf_cache()
                    if model.repo_id in downloaded_repos:
                        actual_size_gb = downloaded_repos[model.repo_id]
                        expected_size_gb = model.size_mb / 1024
                        if expected_size_gb > 0:
                            pct = min(99, (actual_size_gb / expected_size_gb) * 100)
                            progress.downloaded_bytes = int((pct / 100) * progress.total_bytes)
                            # Only callback if progress changed by at least 1%
                            if callback and int(pct) > last_pct:
                                last_pct = int(pct)
                                callback(pct)
                except Exception as e:
                    print(f"[ModelManager] Poll error: {e}")
                time.sleep(0.5)  # Poll every 0.5 seconds for smoother progress

        def do_download():
            """Perform the actual download in a thread"""
            try:
                if model.files:
                    # Descargar archivos especificos
                    for i, filename in enumerate(model.files):
                        hf_hub_download(repo_id=model.repo_id, filename=filename)
                        pct = ((i + 1) / len(model.files)) * 100
                        progress.downloaded_bytes = int((pct / 100) * progress.total_bytes)
                        if callback:
                            callback(pct)
                else:
                    # Descargar repo completo
                    snapshot_download(repo_id=model.repo_id)
            except Exception as e:
                download_error[0] = e
            finally:
                download_complete.set()

        try:
            # Signal that download is starting
            if callback:
                callback(1)  # 1% to show that download has started

            # Start polling thread for progress updates
            poll_thread = threading.Thread(target=poll_cache_size, daemon=True)
            poll_thread.start()

            # Start download thread
            download_thread = threading.Thread(target=do_download, daemon=True)
            download_thread.start()

            # Wait for download to complete
            download_thread.join()
            download_complete.set()  # Signal polling to stop

            if download_error[0]:
                raise download_error[0]

            # Final progress update
            progress.downloaded_bytes = progress.total_bytes
            if callback:
                callback(100)

            return True

        except HfHubHTTPError as e:
            progress.error = _get_user_friendly_error(e, model.name)
            return False
        except Exception as e:
            progress.error = _get_user_friendly_error(e, model.name)
            return False

    def _download_from_hf(self, model: ModelInfo, progress: DownloadProgress, callback: Callable = None) -> bool:
        """Descargar desde Hugging Face"""
        try:
            model_path = MODELS_DIR / model.category.value / model.id
            snapshot_download(
                repo_id=model.repo_id,
                local_dir=str(model_path),
                local_dir_use_symlinks=False
            )
            progress.downloaded_bytes = progress.total_bytes
            return True

        except HfHubHTTPError as e:
            progress.error = _get_user_friendly_error(e, model.name)
            return False
        except Exception as e:
            progress.error = _get_user_friendly_error(e, model.name)
            return False

    def _download_from_url(self, model: ModelInfo, progress: DownloadProgress, callback: Callable = None) -> bool:
        """Descargar desde URL directa"""
        try:
            model_path = MODELS_DIR / model.category.value / model.id
            model_path.mkdir(parents=True, exist_ok=True)

            filename = model.download_url.split("/")[-1]
            file_path = model_path / filename

            response = requests.get(model.download_url, stream=True)
            response.raise_for_status()  # Raise for HTTP errors
            total = int(response.headers.get('content-length', progress.total_bytes))
            progress.total_bytes = total

            with open(file_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
                    progress.downloaded_bytes += len(chunk)
                    if callback:
                        callback(progress.progress_percent)

            return True

        except requests.exceptions.HTTPError as e:
            progress.error = _get_user_friendly_error(e, model.name)
            return False
        except Exception as e:
            progress.error = _get_user_friendly_error(e, model.name)
            return False

    def _download_argos(self, model: ModelInfo, progress: DownloadProgress, callback: Callable = None) -> bool:
        """Descargar modelo de Argos Translate"""
        try:
            import argostranslate.package
            import argostranslate.translate

            argostranslate.package.update_package_index()
            available_packages = argostranslate.package.get_available_packages()

            # Parse model ID dynamically: argos-{from}-{to}
            if model.id.startswith("argos-") and "-" in model.id[6:]:
                parts = model.id[6:].split("-")
                if len(parts) == 2:
                    from_code, to_code = parts[0], parts[1]
                else:
                    progress.error = f"Invalid Argos model ID format: {model.id}"
                    return False
            else:
                progress.error = f"Unknown Argos model: {model.id}"
                return False

            package = next(
                (p for p in available_packages
                 if p.from_code == from_code and p.to_code == to_code),
                None
            )

            if package:
                argostranslate.package.install_from_path(package.download())
                progress.downloaded_bytes = progress.total_bytes
                return True

            progress.error = f"Translation package for {from_code} -> {to_code} not found in Argos repository."
            return False

        except ImportError:
            progress.error = (
                "Local translation engine is not available. "
                "Visit the Models page to install translation packages."
            )
            return False
        except Exception as e:
            progress.error = _get_user_friendly_error(e, model.name)
            return False

    # ===============================
    # ELIMINACION
    # ===============================

    def delete_model(self, model_id: str) -> bool:
        """Eliminar un modelo"""
        model = AVAILABLE_MODELS.get(model_id)
        if not model:
            raise ValueError(f"Modelo desconocido: {model_id}")

        if not self.is_installed(model_id):
            return True

        # No permitir eliminar si comparte repo
        if model.shared_with:
            raise RuntimeError(
                f"No se puede eliminar {model_id} - comparte archivos con {model.shared_with}. "
                f"Elimina {model.shared_with} para remover ambos."
            )

        try:
            if model.is_chatterbox or model.uses_hf_cache:
                return self._delete_from_hf_cache(model)
            else:
                model_path = MODELS_DIR / model.category.value / model_id
                if model_path.exists():
                    shutil.rmtree(model_path)
                settings_service.remove_installed_model(model_id)
                return True

        except Exception as e:
            raise RuntimeError(f"Error eliminando modelo: {e}")

    def _delete_from_hf_cache(self, model: ModelInfo) -> bool:
        """Eliminar modelo del cache de HuggingFace"""
        try:
            cache_info = scan_cache_dir(str(HF_CACHE_DIR))
            for repo in cache_info.repos:
                if repo.repo_id == model.repo_id:
                    delete_strategy = cache_info.delete_revisions(
                        *[rev.commit_hash for rev in repo.revisions]
                    )
                    delete_strategy.execute()
                    return True
            return False
        except Exception as e:
            raise RuntimeError(f"Error eliminando de cache HF: {e}")

    # ===============================
    # UTILIDADES
    # ===============================

    def _scan_hf_cache(self) -> Dict[str, float]:
        """Escanear cache de HF y retornar repos con su tamano en GB"""
        downloaded = {}
        try:
            cache_info = scan_cache_dir(str(HF_CACHE_DIR))
            for repo in cache_info.repos:
                downloaded[repo.repo_id] = repo.size_on_disk / (1024**3)
        except Exception as e:
            print(f"[ModelManager] Warning: Could not scan HF cache at {HF_CACHE_DIR}: {e}")
        return downloaded

    def get_total_size_installed(self) -> float:
        """Obtener tamano total en GB de modelos instalados"""
        total = 0.0

        # Models in HF cache (Chatterbox, F5-TTS, Kokoro, Orpheus, etc.)
        downloaded = self._scan_hf_cache()
        hf_cache_repos = set(
            m.repo_id for m in AVAILABLE_MODELS.values()
            if (m.is_chatterbox or m.uses_hf_cache) and m.repo_id
        )
        for repo_id, size_gb in downloaded.items():
            if repo_id in hf_cache_repos:
                total += size_gb

        # Otros modelos (local)
        for model_id in settings_service.settings.models_installed:
            model = AVAILABLE_MODELS.get(model_id)
            if model and not model.is_chatterbox and not model.uses_hf_cache:
                total += model.size_mb / 1024

        return round(total, 2)

    def get_recommended_models(self) -> List[ModelInfo]:
        """Obtener modelos recomendados para primera instalacion"""
        return [m for m in AVAILABLE_MODELS.values() if m.is_default]

    def cancel_download(self, model_id: str):
        """Cancelar descarga en progreso"""
        if model_id in self._downloads:
            self._downloads[model_id].status = ModelStatus.ERROR
            self._downloads[model_id].error = "Cancelado por usuario"
            del self._downloads[model_id]

    # ===============================
    # API para compatibilidad
    # ===============================

    def get_model_status_list(self) -> List[Dict]:
        """Get download status for all models (formato legacy)"""
        result = []
        downloaded_repos = self._scan_hf_cache()

        for model_id, model in AVAILABLE_MODELS.items():
            is_downloaded = False
            downloaded_size = 0
            download_progress = 0

            if (model.is_chatterbox or model.uses_hf_cache) and model.repo_id:
                is_downloaded, downloaded_size, completeness = self._get_hf_cache_status(model, downloaded_repos)
                if is_downloaded:
                    download_progress = 100
                elif completeness > 0:
                    download_progress = min(99, int(completeness * 100))
            else:
                is_downloaded = settings_service.is_model_installed(model_id)
                if is_downloaded:
                    download_progress = 100

            result.append({
                "id": model_id,
                "name": model.name,
                "description": model.description,
                "size_gb": model.size_mb / 1024,
                "downloaded": is_downloaded,
                "downloaded_size_gb": round(downloaded_size, 2) if downloaded_size else 0,
                "download_progress": download_progress,
                "repo_id": model.repo_id or "",
                "category": model.category.value
            })

        return result


# Instancia global
_manager: Optional[ModelManager] = None


def get_model_manager() -> ModelManager:
    """Obtener instancia del model manager"""
    global _manager
    if _manager is None:
        _manager = ModelManager()
    return _manager
