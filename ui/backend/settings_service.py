"""
Settings Service - Persistencia de configuracion para Whisperall
Guarda automaticamente todas las configuraciones del usuario.
"""

import json
from typing import Any, Dict, Optional
from pydantic import BaseModel
import threading

from app_paths import get_settings_path

# Directorio de configuracion
SETTINGS_FILE = get_settings_path()


class TTSProviderSettings(BaseModel):
    """Configuracion de proveedores TTS"""
    selected: str = "chatterbox"
    chatterbox: Dict[str, Any] = {"model": "base", "voice_id": None}
    kokoro: Dict[str, Any] = {"voice": "af_sky", "speed": 1.0}
    elevenlabs: Dict[str, Any] = {"voice_id": None, "model": "eleven_turbo_v2"}
    openai: Dict[str, Any] = {"voice": "alloy", "model": "tts-1"}
    fishaudio: Dict[str, Any] = {"voice_id": None, "model": "default"}
    siliconflow: Dict[str, Any] = {"voice_id": None, "model": "cosyvoice"}
    minimax: Dict[str, Any] = {"voice_id": None, "model": "speech-02"}


class STTProviderSettings(BaseModel):
    """Configuracion de proveedores STT"""
    selected: str = "faster-whisper-base"
    faster_whisper: Dict[str, Any] = {"model": "base", "language": "auto", "device": "auto"}
    openai_whisper: Dict[str, Any] = {"model": "whisper-1"}
    deepgram: Dict[str, Any] = {"model": "nova-2"}
    groq: Dict[str, Any] = {"model": "whisper-large-v3"}
    dashscope: Dict[str, Any] = {"model": "paraformer-v2"}


class AIEditProviderSettings(BaseModel):
    """Configuracion de proveedores AI Edit"""
    selected: str = "openai"
    ollama: Dict[str, Any] = {"model": "llama3", "base_url": "http://localhost:11434"}
    openai: Dict[str, Any] = {"model": "gpt-4o-mini"}
    claude: Dict[str, Any] = {"model": "claude-3-haiku-20240307"}
    gemini: Dict[str, Any] = {"model": "gemini-1.5-flash"}
    deepseek: Dict[str, Any] = {"model": "deepseek-chat", "base_url": "https://api.deepseek.com"}
    moonshot: Dict[str, Any] = {"model": "kimi-k2-0905", "base_url": "https://api.moonshot.ai"}
    minimax: Dict[str, Any] = {"model": "MiniMax-M2", "base_url": "https://api.minimax.chat"}
    zhipu: Dict[str, Any] = {"model": "glm-4-plus", "base_url": "https://open.bigmodel.cn/api/paas"}


class TranslationProviderSettings(BaseModel):
    """Configuracion de proveedores de traduccion"""
    selected: str = "argos"
    argos: Dict[str, Any] = {"source_lang": "auto", "target_lang": "en"}
    deepl: Dict[str, Any] = {"source_lang": "auto", "target_lang": "EN"}
    google: Dict[str, Any] = {"source_lang": "auto", "target_lang": "en"}
    deepseek: Dict[str, Any] = {"source_lang": "auto", "target_lang": "en", "model": "deepseek-chat"}
    zhipu: Dict[str, Any] = {"source_lang": "auto", "target_lang": "en", "model": "glm-4-plus"}


class ProvidersSettings(BaseModel):
    """Configuracion de todos los proveedores"""
    tts: TTSProviderSettings = TTSProviderSettings()
    stt: STTProviderSettings = STTProviderSettings()
    ai_edit: AIEditProviderSettings = AIEditProviderSettings()
    translation: TranslationProviderSettings = TranslationProviderSettings()


class APIKeysSettings(BaseModel):
    """API Keys - se guardan encriptadas en produccion"""
    openai: Optional[str] = None
    elevenlabs: Optional[str] = None
    claude: Optional[str] = None
    gemini: Optional[str] = None
    google: Optional[str] = None
    deepl: Optional[str] = None
    deepgram: Optional[str] = None
    groq: Optional[str] = None
    deepseek: Optional[str] = None
    zhipu: Optional[str] = None  # GLM-4.7
    moonshot: Optional[str] = None
    minimax: Optional[str] = None
    fishaudio: Optional[str] = None
    cartesia: Optional[str] = None
    playht: Optional[str] = None
    siliconflow: Optional[str] = None
    zyphra: Optional[str] = None
    narilabs: Optional[str] = None
    dashscope: Optional[str] = None
    assemblyai: Optional[str] = None
    gladia: Optional[str] = None
    huggingface: Optional[str] = None


class HotkeysSettings(BaseModel):
    """Atajos de teclado globales"""
    dictate: str = "Alt+X"
    read_clipboard: str = "Ctrl+Shift+R"
    stt_paste: str = "Alt+Shift+S"
    pause: str = "Ctrl+Shift+P"
    stop: str = "Ctrl+Shift+S"
    ai_edit: str = "Ctrl+Shift+E"
    translate: str = "Ctrl+Shift+T"
    speed_up: str = "Ctrl+Shift+Up"
    speed_down: str = "Ctrl+Shift+Down"


class ReaderSettings(BaseModel):
    """Configuracion del lector de texto"""
    speed: float = 1.0
    auto_read: bool = False
    skip_urls: bool = True
    skip_emails: bool = True
    skip_code: bool = False
    voice: str = "af_sky"
    highlight_words: bool = True


class STTSettings(BaseModel):
    """Configuracion de Speech to Text"""
    auto_punctuation: bool = True
    filler_removal: bool = True
    backtrack: bool = True
    smart_formatting: bool = True
    language: str = "auto"
    transcription_mode: str = "final"  # final | live
    hotkey_mode: str = "toggle"  # toggle | hold
    auto_paste: bool = False
    overlay_enabled: bool = True


class DiarizationSafetySettings(BaseModel):
    """Configuracion de contencion termica para diarizacion"""
    mode: str = "safe"  # safe | balanced | performance
    device: str = "cpu"  # cpu | gpu | auto
    test_hotspot_c: Optional[float] = None  # Fuerza guard para pruebas


class DiarizationCacheSettings(BaseModel):
    """Configuracion de cache para audio de diarizacion"""
    max_age_days: int = 30
    max_size_gb: float = 10.0


class DiarizationSettings(BaseModel):
    """Configuracion de diarizacion"""
    safety: DiarizationSafetySettings = DiarizationSafetySettings()
    cache: DiarizationCacheSettings = DiarizationCacheSettings()


class PerformanceSettings(BaseModel):
    """Configuracion de rendimiento global"""
    fast_mode: bool = False  # Deshabilita CFG para ~50% mas rapido
    device: str = "auto"  # auto | cuda | cpu
    preload_models: bool = True  # Pre-cargar modelos al inicio


class ActionSoundSettings(BaseModel):
    """Configuracion de sonidos para acciones"""
    start: bool = True
    complete: bool = True


class UISettings(BaseModel):
    """Configuracion de interfaz"""
    theme: str = "dark"
    language: str = "es"
    minimize_to_tray: bool = True
    start_minimized: bool = False
    show_notifications: bool = True
    save_history: bool = True
    analytics: bool = False
    action_sounds: ActionSoundSettings = ActionSoundSettings()


class AppSettings(BaseModel):
    """Configuracion completa de la aplicacion"""
    providers: ProvidersSettings = ProvidersSettings()
    api_keys: APIKeysSettings = APIKeysSettings()
    hotkeys: HotkeysSettings = HotkeysSettings()
    reader: ReaderSettings = ReaderSettings()
    stt: STTSettings = STTSettings()
    diarization: DiarizationSettings = DiarizationSettings()
    performance: PerformanceSettings = PerformanceSettings()
    ui: UISettings = UISettings()
    models_installed: list = []
    onboarding_completed: bool = False

    class Config:
        extra = "allow"  # Permitir campos adicionales para compatibilidad


class SettingsService:
    """Servicio singleton para gestionar configuraciones"""

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
        self._settings: AppSettings = self._load_settings()
        self._save_lock = threading.Lock()

    def _load_settings(self) -> AppSettings:
        """Carga settings desde archivo o usa defaults"""
        if SETTINGS_FILE.exists():
            try:
                with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                return AppSettings(**data)
            except Exception as e:
                print(f"Error loading settings: {e}")
                return AppSettings()
        return AppSettings()

    def _save_settings(self):
        """Guarda settings a archivo"""
        with self._save_lock:
            try:
                # Asegurar que el directorio existe
                SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
                with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(self._settings.model_dump(), f, indent=2, ensure_ascii=False)
            except Exception as e:
                print(f"Error saving settings: {e}")

    @property
    def settings(self) -> AppSettings:
        """Obtener configuracion actual"""
        return self._settings

    def get(self, path: str, default: Any = None) -> Any:
        """
        Obtener un valor de configuracion por path.
        Ejemplo: get("providers.tts.selected")
        """
        keys = path.split(".")
        value = self._settings.model_dump()
        try:
            for key in keys:
                value = value[key]
            return value
        except (KeyError, TypeError):
            return default

    def set(self, path: str, value: Any) -> bool:
        """
        Establecer un valor de configuracion por path.
        Ejemplo: set("providers.tts.selected", "kokoro")
        Auto-guarda despues de cada cambio.
        """
        keys = path.split(".")
        data = self._settings.model_dump()

        # Navegar hasta el penultimo nivel
        current = data
        try:
            for key in keys[:-1]:
                current = current[key]
            current[keys[-1]] = value

            # Actualizar el modelo
            self._settings = AppSettings(**data)
            self._save_settings()
            return True
        except (KeyError, TypeError) as e:
            print(f"Error setting {path}: {e}")
            return False

    def update_section(self, section: str, data: Dict[str, Any]) -> bool:
        """
        Actualizar una seccion completa.
        Ejemplo: update_section("hotkeys", {"dictate": "Ctrl+D"})
        """
        current_data = self._settings.model_dump()
        if section in current_data:
            current_data[section].update(data)
            self._settings = AppSettings(**current_data)
            self._save_settings()
            return True
        return False

    def get_all(self) -> Dict[str, Any]:
        """Obtener toda la configuracion como dict"""
        return self._settings.model_dump()

    def reset_to_defaults(self, section: Optional[str] = None):
        """Resetear a valores por defecto"""
        if section:
            defaults = AppSettings()
            default_section = getattr(defaults, section, None)
            if default_section:
                current_data = self._settings.model_dump()
                current_data[section] = default_section.model_dump() if hasattr(default_section, 'model_dump') else default_section
                self._settings = AppSettings(**current_data)
        else:
            self._settings = AppSettings()
        self._save_settings()

    # Metodos de conveniencia para secciones comunes

    def get_api_key(self, provider: str) -> Optional[str]:
        """Obtener API key de un proveedor"""
        return getattr(self._settings.api_keys, provider, None)

    def set_api_key(self, provider: str, key: str) -> bool:
        """Establecer API key de un proveedor"""
        return self.set(f"api_keys.{provider}", key)

    def get_selected_provider(self, function: str) -> str:
        """Obtener proveedor seleccionado para una funcion (tts, stt, ai_edit, translation)"""
        return self.get(f"providers.{function}.selected", "")

    def set_selected_provider(self, function: str, provider: str) -> bool:
        """Establecer proveedor seleccionado"""
        return self.set(f"providers.{function}.selected", provider)

    def is_model_installed(self, model_id: str) -> bool:
        """Verificar si un modelo esta instalado"""
        return model_id in self._settings.models_installed

    def add_installed_model(self, model_id: str):
        """Registrar modelo como instalado"""
        if model_id not in self._settings.models_installed:
            self._settings.models_installed.append(model_id)
            self._save_settings()

    def remove_installed_model(self, model_id: str):
        """Eliminar modelo de la lista de instalados"""
        if model_id in self._settings.models_installed:
            self._settings.models_installed.remove(model_id)
            self._save_settings()

    def get_hotkey(self, action: str) -> str:
        """Obtener hotkey para una accion"""
        return getattr(self._settings.hotkeys, action, "")

    def set_hotkey(self, action: str, hotkey: str) -> bool:
        """Establecer hotkey para una accion"""
        return self.set(f"hotkeys.{action}", hotkey)

    def is_onboarding_completed(self) -> bool:
        """Verificar si el onboarding fue completado"""
        return self._settings.onboarding_completed

    def complete_onboarding(self):
        """Marcar onboarding como completado"""
        self._settings.onboarding_completed = True
        self._save_settings()


# Instancia global
settings_service = SettingsService()


# Funciones de utilidad para uso directo
def get_settings() -> SettingsService:
    """Obtener instancia del servicio de settings"""
    return settings_service


def get_setting(path: str, default: Any = None) -> Any:
    """Atajo para obtener un setting"""
    return settings_service.get(path, default)


def set_setting(path: str, value: Any) -> bool:
    """Atajo para establecer un setting"""
    return settings_service.set(path, value)
