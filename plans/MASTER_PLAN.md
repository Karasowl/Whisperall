# Whisperall: La App Definitiva de Voz + IA

## Vision
Crear la aplicación todo-en-uno para voz e inteligencia artificial que combine:

---

## Packaging Targets
- Ship three native builds: Windows, Linux, macOS.

## Installer Strategy (Goal Memory)
- Goal: normal installers, no venv talk to end users.
- Decision 1: GPU toggle + autodetect, default Auto, fallback CPU if no CUDA.
- Decision 2: WhisperX as optional separate backend to avoid numpy conflict with pyannote.
- Packaging: CPU installer default + optional GPU backend + optional WhisperX backend.

## ARQUITECTURA CRITICA: Sistema de Proveedores y Modelos

### Principios Fundamentales

1. **Cada funcion puede usar LOCAL o API**
2. **Modelos descargables y eliminables**
3. **Permisos antes de descargar (mostrar tamano)**
4. **Barra de progreso en descargas**
5. **Todos los settings se guardan automaticamente**

### Sistema de Proveedores por Funcion

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROVIDER SYSTEM                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TTS (Text to Speech)                                           │
│  ├── Local: Chatterbox, Kokoro, Piper                           │
│  └── API: ElevenLabs, OpenAI TTS, Google Cloud TTS, Azure       │
│                                                                  │
│  STT (Speech to Text)                                           │
│  ├── Local: Faster-Whisper (tiny/base/small/medium/large)       │
│  └── API: OpenAI Whisper, Google STT, Azure STT, Deepgram       │
│                                                                  │
│  AI Edit (Text Processing)                                      │
│  ├── Local: Ollama (llama3, mistral, etc.)                      │
│  └── API: OpenAI GPT, Claude, Gemini                            │
│                                                                  │
│  Translation                                                    │
│  ├── Local: Argos Translate, NLLB                               │
│  └── API: Google Translate, DeepL                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Model Manager

```
┌─────────────────────────────────────────────────────────────────┐
│                    MODEL MANAGER                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  models/                                                        │
│  ├── stt/                                                       │
│  │   ├── faster-whisper-tiny/     (39 MB)  [Instalado]         │
│  │   ├── faster-whisper-base/     (74 MB)  [Instalado]         │
│  │   ├── faster-whisper-small/    (244 MB) [No instalado]      │
│  │   ├── faster-whisper-medium/   (769 MB) [No instalado]      │
│  │   └── faster-whisper-large-v3/ (1.5 GB) [No instalado]      │
│  │                                                              │
│  ├── tts/                                                       │
│  │   ├── kokoro/                  (150 MB) [Instalado]         │
│  │   ├── piper-es/                (50 MB)  [No instalado]      │
│  │   └── chatterbox/              (Ya incluido)                │
│  │                                                              │
│  ├── translation/                                               │
│  │   ├── argos-es-en/             (100 MB) [No instalado]      │
│  │   └── argos-en-es/             (100 MB) [No instalado]      │
│  │                                                              │
│  └── ai/                                                        │
│      └── (Ollama maneja sus propios modelos)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### UI de Descarga de Modelos

```
┌─────────────────────────────────────────────────────────────────┐
│  Descargar Modelo                                          [X] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Para usar el dictado por voz, necesitas descargar              │
│  el modelo de reconocimiento de voz.                            │
│                                                                  │
│  Modelo: Faster-Whisper Base                                    │
│  Tamano: 74 MB                                                  │
│  Idiomas: 99+                                                   │
│  Velocidad: Rapida                                              │
│  Precision: Buena                                               │
│                                                                  │
│  ████████████████░░░░░░░░░░░░░░  45% (33 MB / 74 MB)           │
│                                                                  │
│  [Cancelar]                                    [Descargar Otro] │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Configuracion de APIs

```
┌─────────────────────────────────────────────────────────────────┐
│  Settings > APIs                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OpenAI                                                         │
│  API Key: [sk-xxxxxxxxxxxxxxxxxxxxx...] [Test] [Save]          │
│  Status: ✅ Conectado                                           │
│                                                                  │
│  ElevenLabs                                                     │
│  API Key: [xxxxxxxxxxxxxxxxxxxxxxxxx...] [Test] [Save]          │
│  Status: ❌ No configurado                                       │
│                                                                  │
│  Google Cloud                                                   │
│  Credentials: [Subir JSON]                                      │
│  Status: ❌ No configurado                                       │
│                                                                  │
│  Gemini                                                         │
│  API Key: [_______________________________] [Test] [Save]       │
│  Status: ❌ No configurado                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Seleccion de Proveedor por Funcion

```
┌─────────────────────────────────────────────────────────────────┐
│  Settings > Proveedores                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Text to Speech (TTS)                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Proveedor: [▼ Chatterbox (Local)                     ]  │   │
│  │            ├── Chatterbox (Local) - Voice Cloning       │   │
│  │            ├── Kokoro (Local) - Rapido                  │   │
│  │            ├── ElevenLabs (API) - Premium               │   │
│  │            └── OpenAI TTS (API)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Speech to Text (STT)                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Proveedor: [▼ Faster-Whisper Base (Local)            ]  │   │
│  │            ├── Faster-Whisper Tiny (Local) - 39 MB      │   │
│  │            ├── Faster-Whisper Base (Local) - 74 MB      │   │
│  │            ├── Faster-Whisper Large (Local) - 1.5 GB    │   │
│  │            ├── OpenAI Whisper (API)                     │   │
│  │            └── Deepgram (API)                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  AI Edit                                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Proveedor: [▼ OpenAI GPT-4 (API)                     ]  │   │
│  │            ├── Ollama - Llama 3 (Local)                 │   │
│  │            ├── OpenAI GPT-4 (API)                       │   │
│  │            ├── Claude (API)                             │   │
│  │            └── Gemini (API)                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Persistencia de Settings

**Archivo: `settings.json`**
```json
{
  "providers": {
    "tts": {
      "selected": "chatterbox",
      "chatterbox": {
        "model": "base",
        "voice_id": "default"
      },
      "kokoro": {
        "voice": "af_sky",
        "speed": 1.0
      },
      "elevenlabs": {
        "voice_id": "xxxxx",
        "model": "eleven_turbo_v2"
      }
    },
    "stt": {
      "selected": "faster-whisper-base",
      "faster-whisper": {
        "model": "base",
        "language": "auto"
      }
    },
    "ai_edit": {
      "selected": "openai",
      "openai": {
        "model": "gpt-4"
      }
    },
    "translation": {
      "selected": "argos",
      "source_lang": "auto",
      "target_lang": "en"
    }
  },
  "api_keys": {
    "openai": "sk-xxxxx",
    "elevenlabs": "xxxxx",
    "gemini": "xxxxx",
    "deepl": "xxxxx"
  },
  "hotkeys": {
    "dictate": "Alt+X",
    "read_clipboard": "Ctrl+Shift+R",
    "pause": "Ctrl+Shift+P",
    "stop": "Ctrl+Shift+S",
    "ai_edit": "Ctrl+Shift+E",
    "translate": "Ctrl+Shift+T"
  },
  "reader": {
    "speed": 1.0,
    "auto_read": false,
    "skip_urls": true,
    "voice": "af_sky"
  },
  "stt": {
    "auto_punctuation": true,
    "filler_removal": true,
    "backtrack": true
  },
  "ui": {
    "theme": "dark",
    "language": "es",
    "minimize_to_tray": true
  },
  "models_installed": [
    "faster-whisper-base",
    "kokoro"
  ]
}
```

### Primera Ejecucion (Onboarding)

```
┌─────────────────────────────────────────────────────────────────┐
│  Bienvenido a ChatterboxUI                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Para empezar, necesitamos configurar algunos modelos.          │
│                                                                  │
│  Modelos recomendados para empezar:                             │
│                                                                  │
│  ☑ Faster-Whisper Base (STT)           74 MB                   │
│    Para dictado por voz                                         │
│                                                                  │
│  ☑ Kokoro (TTS Rapido)                 150 MB                  │
│    Para lectura en tiempo real                                  │
│                                                                  │
│  ☐ Argos Translate ES↔EN               200 MB                  │
│    Para traduccion local                                        │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│  Total a descargar: 224 MB                                      │
│                                                                  │
│  O puedes usar APIs en su lugar:                                │
│  [Configurar APIs]                                              │
│                                                                  │
│  [Saltar por ahora]                    [Descargar Seleccionados]│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---
- **Text to Speech (TTS)** - Voice cloning de alta calidad (Chatterbox)
- **Speech to Text (STT)** - Dictado en tiempo real (como Wispr Flow)
- **Lectura en Tiempo Real** - Leer cualquier texto copiado (como Speechify)
- **Edicion con IA** - Comandos de voz para editar texto
- **Traduccion en Tiempo Real** - Mientras hablas o lees

---

## Parte 1: Lo Que Ya Tenemos (ChatterboxUI)

### 1.1 Text to Speech
- [x] Voice cloning con Chatterbox
- [x] Modelo Turbo con tags emocionales ([laugh], [sigh], etc.)
- [x] Modelo Multilingual (30+ idiomas)
- [x] Voice Library con analisis automatico
- [x] Sistema de Presets
- [x] Historial de generaciones
- [x] Audiobook generator

### 1.2 UI
- [x] App Electron
- [x] Frontend Next.js
- [x] Backend FastAPI

---

## Parte 2: Copiar Wispr Flow (Speech to Text)

### 2.1 Caracteristicas de Wispr Flow a Implementar

| Feature | Prioridad | Descripcion |
|---------|-----------|-------------|
| **Alt+X Dictation** | CRITICA | Hotkey global para dictar en cualquier app |
| **Smart Formatting** | CRITICA | Auto-puntuacion, listas, mayusculas |
| **Backtrack** | ALTA | "actually", "scratch that" para corregir |
| **Filler Removal** | ALTA | Eliminar "um", "eh", pausas |
| **Personal Dictionary** | ALTA | Aprender palabras custom |
| **Snippets** | MEDIA | Atajos de voz para texto frecuente |
| **Command Mode** | MEDIA | "delete that", "new paragraph", "bold" |
| **Style Adaptation** | MEDIA | Formal/casual segun contexto |
| **Whisper Mode** | BAJA | Dictar en voz baja |
| **Notes Sync** | BAJA | Historial de dictados |

### 2.2 Motor STT: Faster-Whisper

**Por que Faster-Whisper:**
- 4x mas rapido que Whisper original
- Funciona 100% local (privacidad)
- GPU: tiempo real con latencia <300ms
- CPU: 3-10x real-time
- No requiere FFmpeg (usa PyAV)
- Soporta modelos distil-whisper (aun mas rapido)

**Modelos disponibles:**
| Modelo | Tamano | Velocidad | Precision |
|--------|--------|-----------|-----------|
| tiny | 39MB | Muy rapida | Basica |
| base | 74MB | Rapida | Buena |
| small | 244MB | Moderada | Muy buena |
| medium | 769MB | Lenta | Excelente |
| large-v3 | 1.5GB | Muy lenta | Mejor |
| distil-large-v3 | 756MB | Rapida | Casi igual a large |

**Recomendacion:** `distil-large-v3` para balance velocidad/precision

### 2.3 Arquitectura STT

```
┌─────────────────────────────────────────────────────────────┐
│                     WINDOWS                                  │
│                                                              │
│  ┌──────────────┐         ┌─────────────────────────────┐   │
│  │ Cualquier    │  Alt+X  │      ChatterboxUI           │   │
│  │ App (Word,   │ ──────> │  ┌─────────────────────┐    │   │
│  │ Chrome, etc) │         │  │  STT Service        │    │   │
│  │              │ <────── │  │  • Faster-Whisper   │    │   │
│  │  [Texto]     │  Texto  │  │  • Smart Formatting │    │   │
│  └──────────────┘         │  │  • Backtrack        │    │   │
│                           │  │  • Dictionary       │    │   │
│                           │  └─────────────────────┘    │   │
│                           │                              │   │
│  Mic ──────────────────────> Audio Stream               │   │
│                           │                              │   │
│  Hotkeys:                 │                              │   │
│  • Alt+X: Iniciar/Parar   │                              │   │
│  • Esc: Cancelar          │                              │   │
│  • Enter: Confirmar       │                              │   │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Archivos STT a Crear

| Archivo | Proposito |
|---------|-----------|
| `ui/backend/stt_service.py` | Servicio Faster-Whisper |
| `ui/backend/smart_formatter.py` | Formateo inteligente |
| `ui/backend/backtrack.py` | Logica de correccion |
| `ui/backend/dictionary.py` | Diccionario personal |
| `ui/backend/snippets.py` | Atajos de voz |
| `ui/frontend/src/app/dictate/page.tsx` | UI de dictado |
| `ui/frontend/src/components/DictationOverlay.tsx` | Overlay flotante |

### 2.5 Endpoints STT

```
POST /api/stt/start          - Iniciar grabacion
POST /api/stt/stop           - Parar y obtener texto
POST /api/stt/cancel         - Cancelar
WS   /api/stt/stream         - WebSocket para streaming
GET  /api/stt/status         - Estado actual

POST /api/dictionary/add     - Agregar palabra
GET  /api/dictionary/list    - Listar palabras
DELETE /api/dictionary/{id}  - Eliminar

POST /api/snippets/create    - Crear snippet
GET  /api/snippets/list      - Listar snippets
POST /api/snippets/trigger   - Activar snippet
```

---

## Parte 3: Lector en Tiempo Real (Reader)

### 3.1 Motor TTS Rapido: Kokoro

**Por que Kokoro:**
- 82M parametros = muy ligero
- GPU: 90-210x real-time
- CPU: 3-11x real-time
- Calidad superior a modelos mas grandes
- Apache 2.0 (libre)
- 54 voces, 6 idiomas

### 3.2 Caracteristicas Reader

| Feature | Inspirado en | Descripcion |
|---------|--------------|-------------|
| **Clipboard Reading** | Balabolka | Leer texto copiado |
| **Word Highlighting** | Speechify | Resaltar palabra actual |
| **Speed Control** | Speechify | 0.5x - 3x |
| **Global Hotkeys** | Balabolka | Ctrl+Shift+R/P/S |
| **Auto-Read** | Usuario | Leer automaticamente al copiar |
| **Skip Content** | Speechify | Ignorar URLs, emails |
| **System Tray** | Balabolka | Icono + menu |

### 3.3 Archivos Reader a Crear

| Archivo | Proposito |
|---------|-----------|
| `ui/backend/reader_service.py` | Servicio Kokoro TTS |
| `ui/frontend/src/app/reader/page.tsx` | UI Reader |
| `ui/frontend/src/components/ReaderOverlay.tsx` | Mini-player flotante |

---

## Parte 4: Edicion con IA (AI Edit)

### 4.1 Flujo de Edicion

```
1. Usuario selecciona texto en cualquier app
2. Presiona hotkey (ej: Ctrl+Shift+E)
3. Habla comando: "hazlo mas formal" / "resume esto" / "traduce al ingles"
4. IA procesa y reemplaza el texto seleccionado
```

### 4.2 Comandos de Voz Soportados

| Comando | Accion |
|---------|--------|
| "hazlo mas formal" | Cambiar tono a formal |
| "hazlo mas casual" | Cambiar tono a casual |
| "resume esto" | Resumir texto |
| "expande esto" | Expandir con mas detalle |
| "traduce al [idioma]" | Traducir |
| "corrige errores" | Corregir gramatica |
| "convierte a lista" | Hacer bullet points |
| "mejora redaccion" | Mejorar estilo |

### 4.3 Motor IA

**Opciones:**
1. **Local (Ollama)** - Privado, sin costo, necesita GPU
2. **OpenAI API** - Mejor calidad, requiere API key
3. **Claude API** - Excelente para edicion, requiere API key

**Recomendacion:** Soportar todos, usuario elige

### 4.4 Archivos AI Edit a Crear

| Archivo | Proposito |
|---------|-----------|
| `ui/backend/ai_editor.py` | Servicio de edicion con IA |
| `ui/frontend/src/app/settings/ai/page.tsx` | Config de IA |

---

## Parte 5: Traduccion en Tiempo Real

### 5.1 Modos de Traduccion

1. **STT + Traduccion:** Hablas en espanol → texto en ingles
2. **TTS + Traduccion:** Texto en ingles → voz en espanol
3. **Clipboard Traduccion:** Copias texto → se traduce automaticamente

### 5.2 Motor de Traduccion

**Opciones locales:**
- **Argos Translate** - Offline, buena calidad, muchos idiomas
- **LibreTranslate** - Self-hosted
- **NLLB (Meta)** - 200 idiomas, local

**Opciones cloud:**
- Google Translate API
- DeepL API

### 5.3 Archivos Traduccion

| Archivo | Proposito |
|---------|-----------|
| `ui/backend/translator.py` | Servicio de traduccion |
| `ui/frontend/src/app/translate/page.tsx` | UI Traduccion |

---

## Parte 6: Interfaz Unificada

### 6.1 Nueva Navegacion

```
┌─────────────────────────────────────────┐
│  ChatterboxUI                      ─ □ X│
├─────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐│
│ │ TTS │ │ STT │ │READ │ │EDIT │ │TRANS││
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘│
├─────────────────────────────────────────┤
│                                         │
│         [Contenido de la pagina]        │
│                                         │
└─────────────────────────────────────────┘
```

### 6.2 Paginas

| Pagina | Funcion |
|--------|---------|
| `/` | TTS - Generacion de voz (actual) |
| `/dictate` | STT - Dictado con Whisper |
| `/reader` | Lector de clipboard |
| `/edit` | Edicion con IA |
| `/translate` | Traduccion |
| `/voices` | Voice Library (actual) |
| `/audiobook` | Audiobook generator (actual) |
| `/history` | Historial (actual) |
| `/settings` | Configuracion general |

### 6.3 System Tray Menu

```
ChatterboxUI
├── TTS: Generar voz...
├── STT: Dictar (Alt+X)
├── Reader: Leer clipboard (Ctrl+Shift+R)
├── Edit: Editar seleccion (Ctrl+Shift+E)
├── ─────────────────
├── Pausar lectura
├── Detener todo
├── ─────────────────
├── Configuracion
└── Salir
```

---

## Parte 7: Hotkeys Globales

| Hotkey | Accion | Personalizable |
|--------|--------|----------------|
| `Alt+X` | Iniciar/parar dictado | Si |
| `Ctrl+Shift+R` | Leer clipboard | Si |
| `Ctrl+Shift+P` | Pausar/reanudar | Si |
| `Ctrl+Shift+S` | Detener todo | Si |
| `Ctrl+Shift+E` | Editar seleccion con IA | Si |
| `Ctrl+Shift+T` | Traducir seleccion | Si |
| `Ctrl+Shift+↑` | Aumentar velocidad | Si |
| `Ctrl+Shift+↓` | Disminuir velocidad | Si |

---

## Parte 8: Dependencias Nuevas

### Python (requirements.txt)
```
# STT
faster-whisper>=1.0.0
pyaudio>=0.2.13
webrtcvad>=2.0.10

# TTS Rapido
RealtimeTTS>=0.4.0
kokoro>=0.3.0

# Traduccion
argostranslate>=1.9.0

# IA Local
ollama>=0.1.0

# Hotkeys y Clipboard
pynput>=1.7.6
pyperclip>=1.8.2

# Existentes
fastapi>=0.100.0
uvicorn[standard]>=0.23.0
python-multipart>=0.0.6
pydub>=0.25.1
aiofiles>=23.0.0
imageio-ffmpeg>=0.4.9
```

### Electron (package.json)
```json
{
  "dependencies": {
    "electron-is-dev": "^3.0.1"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.1.8"
  }
}
```

---

## Parte 9: Orden de Implementacion

### Fase 0: Arquitectura Base (PRIMERO)
1. [ ] Crear settings_service.py - Persistencia de configuracion
2. [ ] Crear model_manager.py - Descarga/eliminacion de modelos
3. [ ] Crear provider_registry.py - Registro de proveedores
4. [ ] Crear api_keys_service.py - Gestion de API keys
5. [ ] UI: Settings page con tabs (APIs, Providers, Models, Hotkeys)
6. [ ] UI: Model download dialog con progreso
7. [ ] UI: Onboarding wizard primera ejecucion

### Fase 1: STT Basico (Copiar Wispr Flow Core)
8. [ ] Instalar faster-whisper (cuando usuario lo pida)
9. [ ] Crear stt_service.py con grabacion de mic
10. [ ] Implementar transcripcion en tiempo real
11. [ ] Hotkey global Alt+X para dictar
12. [ ] Overlay flotante mostrando texto
13. [ ] Insertar texto en cursor activo

### Fase 2: Smart Formatting
7. [ ] Auto-puntuacion
8. [ ] Backtrack ("actually", "scratch that")
9. [ ] Filler removal ("um", "eh")
10. [ ] Formato de listas
11. [ ] Mayusculas inteligentes

### Fase 3: Personalizacion STT
12. [ ] Personal Dictionary
13. [ ] Snippets (voice shortcuts)
14. [ ] Command Mode ("delete that", "new paragraph")
15. [ ] UI de configuracion

### Fase 4: Reader (TTS Rapido)
16. [ ] Instalar Kokoro + RealtimeTTS
17. [ ] Crear reader_service.py
18. [ ] Hotkey Ctrl+Shift+R para leer
19. [ ] Word highlighting
20. [ ] Speed control
21. [ ] Auto-read clipboard

### Fase 5: AI Edit
22. [ ] Integrar Ollama/OpenAI/Claude
23. [ ] Hotkey Ctrl+Shift+E
24. [ ] Comandos de voz para edicion
25. [ ] Reemplazo de texto seleccionado

### Fase 6: Traduccion
26. [ ] Integrar Argos Translate
27. [ ] Traduccion en STT
28. [ ] Traduccion en Reader
29. [ ] Hotkey Ctrl+Shift+T

### Fase 7: Polish
30. [ ] System Tray completo
31. [ ] Settings unificados
32. [ ] Onboarding / Tutorial
33. [ ] Documentacion

---

## Parte 10: Comparativa Final

| Feature | Wispr Flow | Speechify | Balabolka | **ChatterboxUI** |
|---------|------------|-----------|-----------|------------------|
| STT Dictado | ✅ | ❌ | ❌ | ✅ |
| TTS Lectura | ❌ | ✅ | ✅ | ✅ |
| Voice Cloning | ❌ | ❌ | ❌ | ✅ |
| Smart Formatting | ✅ | ❌ | ❌ | ✅ |
| Backtrack | ✅ | ❌ | ❌ | ✅ |
| Personal Dict | ✅ | ❌ | ✅ | ✅ |
| Snippets | ✅ | ❌ | ❌ | ✅ |
| Word Highlight | ❌ | ✅ | ❌ | ✅ |
| AI Edit | ❌ | ❌ | ❌ | ✅ |
| Traduccion | ❌ | ❌ | ❌ | ✅ |
| 100% Local | ❌ | ❌ | ✅ | ✅ |
| Gratis | ❌ ($15/m) | ❌ ($139/y) | ✅ | ✅ |

**ChatterboxUI = La unica app que lo tiene TODO, gratis y local.**

---

## Fuentes

### STT
- [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper)
- [WhisperLive](https://github.com/collabora/WhisperLive)
- [WhisperLiveKit](https://github.com/QuentinFuxa/WhisperLiveKit)

### TTS
- [Kokoro TTS](https://kokoroweb.app/en/blog/kokoro-tts-complete-guide-2025)
- [RealtimeTTS](https://github.com/KoljaB/RealtimeTTS)

### Competencia
- [Wispr Flow](https://wisprflow.ai/) - $15/mes
- [Wispr Flow Features](https://wisprflow.ai/features)
- [Speechify](https://speechify.com/) - $139/ano
- [Balabolka](https://www.cross-plus-a.com/balabolka.htm) - Gratis

### Traduccion
- [Argos Translate](https://github.com/argosopentech/argos-translate)
