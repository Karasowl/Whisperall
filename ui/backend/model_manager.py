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
from huggingface_hub.utils import HfHubHTTPError

from settings_service import settings_service
from app_paths import get_models_dir

# Directorios
MODELS_DIR = get_models_dir()
HF_CACHE_DIR = Path(os.path.expanduser("~")) / ".cache" / "huggingface" / "hub"


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
    # Kokoro TTS (Reader rapido)
    # -------------------------
    "kokoro": ModelInfo(
        id="kokoro",
        name="Kokoro TTS",
        category=ModelCategory.TTS,
        description="TTS ultra-rapido de alta calidad. 54 voces, 6 idiomas.",
        size_mb=150,
        repo_id="hexgrad/Kokoro-82M",
        languages=["en", "es", "fr", "ja", "ko", "zh"],
        is_default=False
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
        name="Argos Espanol -> Ingles",
        category=ModelCategory.TRANSLATION,
        description="Traduccion local espanol a ingles.",
        size_mb=100,
        languages=["es", "en"]
    ),
    "argos-en-es": ModelInfo(
        id="argos-en-es",
        name="Argos Ingles -> Espanol",
        category=ModelCategory.TRANSLATION,
        description="Traduccion local ingles a espanol.",
        size_mb=100,
        languages=["en", "es"]
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

        # Chatterbox models (en HF cache)
        downloaded_repos = self._scan_hf_cache()

        for model_id, model in AVAILABLE_MODELS.items():
            is_installed = False
            downloaded_size = 0

            if model.is_chatterbox and model.repo_id:
                # Check HF cache
                if model.repo_id in downloaded_repos:
                    is_installed = True
                    downloaded_size = downloaded_repos[model.repo_id]
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

        if model.is_chatterbox and model.repo_id:
            downloaded_repos = self._scan_hf_cache()
            return model.repo_id in downloaded_repos

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

        if model.is_chatterbox:
            # Chatterbox usa cache de HF
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
            if model.is_chatterbox:
                success = self._download_chatterbox(model, progress, progress_callback)
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

    def _download_chatterbox(self, model: ModelInfo, progress: DownloadProgress, callback: Callable = None) -> bool:
        """Descargar modelo Chatterbox"""
        try:
            if model.files:
                # Descargar archivos especificos
                for i, filename in enumerate(model.files):
                    hf_hub_download(repo_id=model.repo_id, filename=filename)
                    progress.downloaded_bytes = int((i + 1) / len(model.files) * progress.total_bytes)
                    if callback:
                        callback(progress.progress_percent)
            else:
                # Descargar repo completo
                snapshot_download(repo_id=model.repo_id)
                progress.downloaded_bytes = progress.total_bytes

            return True

        except HfHubHTTPError as e:
            progress.error = str(e)
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

        except Exception as e:
            progress.error = str(e)
            return False

    def _download_from_url(self, model: ModelInfo, progress: DownloadProgress, callback: Callable = None) -> bool:
        """Descargar desde URL directa"""
        import requests

        try:
            model_path = MODELS_DIR / model.category.value / model.id
            model_path.mkdir(parents=True, exist_ok=True)

            filename = model.download_url.split("/")[-1]
            file_path = model_path / filename

            response = requests.get(model.download_url, stream=True)
            total = int(response.headers.get('content-length', progress.total_bytes))
            progress.total_bytes = total

            with open(file_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
                    progress.downloaded_bytes += len(chunk)
                    if callback:
                        callback(progress.progress_percent)

            return True

        except Exception as e:
            progress.error = str(e)
            return False

    def _download_argos(self, model: ModelInfo, progress: DownloadProgress, callback: Callable = None) -> bool:
        """Descargar modelo de Argos Translate"""
        try:
            import argostranslate.package
            import argostranslate.translate

            argostranslate.package.update_package_index()
            available_packages = argostranslate.package.get_available_packages()

            if model.id == "argos-es-en":
                from_code, to_code = "es", "en"
            elif model.id == "argos-en-es":
                from_code, to_code = "en", "es"
            else:
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

            return False

        except ImportError:
            progress.error = "argostranslate no instalado"
            return False
        except Exception as e:
            progress.error = str(e)
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
            if model.is_chatterbox:
                return self._delete_chatterbox(model)
            else:
                model_path = MODELS_DIR / model.category.value / model_id
                if model_path.exists():
                    shutil.rmtree(model_path)
                settings_service.remove_installed_model(model_id)
                return True

        except Exception as e:
            raise RuntimeError(f"Error eliminando modelo: {e}")

    def _delete_chatterbox(self, model: ModelInfo) -> bool:
        """Eliminar modelo Chatterbox del cache de HF"""
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
        except Exception:
            pass
        return downloaded

    def get_total_size_installed(self) -> float:
        """Obtener tamano total en GB de modelos instalados"""
        total = 0.0

        # Chatterbox en HF cache
        downloaded = self._scan_hf_cache()
        chatterbox_repos = set(
            m.repo_id for m in AVAILABLE_MODELS.values()
            if m.is_chatterbox and m.repo_id
        )
        for repo_id, size_gb in downloaded.items():
            if repo_id in chatterbox_repos:
                total += size_gb

        # Otros modelos
        for model_id in settings_service.settings.models_installed:
            model = AVAILABLE_MODELS.get(model_id)
            if model and not model.is_chatterbox:
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

            if model.is_chatterbox and model.repo_id:
                is_downloaded = model.repo_id in downloaded_repos
                downloaded_size = downloaded_repos.get(model.repo_id, 0)
            else:
                is_downloaded = settings_service.is_model_installed(model_id)

            result.append({
                "id": model_id,
                "name": model.name,
                "description": model.description,
                "size_gb": model.size_mb / 1024,
                "downloaded": is_downloaded,
                "downloaded_size_gb": round(downloaded_size, 2) if downloaded_size else 0,
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
