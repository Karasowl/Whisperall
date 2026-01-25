# Errores a Resolver 4: Integración Completa de ElevenLabs

## Problema Principal

Actualmente solo estamos usando ElevenLabs para **Text-to-Speech (TTS)**, pero la suscripción Starter ($5/mes) incluye muchas más funcionalidades que no estamos aprovechando.

## Lo que incluye el Plan Starter ($5/mes) - NORMALIZADO A MINUTOS

| # | Servicio | Minutos/mes | Estado | Extra |
|---|----------|-------------|--------|-------|
| 1 | **TTS (máxima calidad)** | 30 min | ✅ Implementado | - |
| 2 | **TTS (Turbo/Flash)** | 60 min | ✅ Implementado | - |
| 3 | **API STT** | 600 min (10h) | ✅ Implementado | $0.48/hora |
| 4 | **STT Realtime (WebSocket)** | 50 min | ❌ Pendiente | - |
| 5 | **Voice Changer** | 30 min | ❌ No implementado | - |
| 6 | **Voice Isolator** | 30 min | ❌ No implementado | - |
| 7 | **Sound Effects** | 12.5 min (750 seg) | ❌ No implementado | - |
| 8 | **Eleven Music** | 11 min | ❌ No implementado | con restricciones |
| 9 | **Doblaje Automático** | 6 min video | ❌ No implementado | con marca de agua |
| 10 | **Dubbing Studio** | 6 min video | ❌ No implementado | con marca de agua |
| 11 | **Voces personalizadas** | 10 voces | ⚡ Parcial | clonación instantánea |

**Total de minutos SIN USAR cada mes:** ~140 minutos de servicios que ya pagas

## Pregunta Clave del Usuario

> "¿Cómo implementamos todo esto? Porque, por ahora, creo que lo único que estamos haciendo es generar texto con 11Labs. Y no sé si, por ejemplo, podamos utilizar las horas que te da solamente por haber pagado una suscripción, las horas que te da de ASR (Voz a texto en tiempo real como le llaman ellos)"

## Estado Actual de Módulos

| Módulo | Provider Actual | ElevenLabs Disponible | Acción Necesaria |
|--------|-----------------|----------------------|------------------|
| **dictate/** | Groq/Whisper | ✅ STT implementado | Agregar como opción |
| **transcribe/** | faster-whisper | ✅ STT implementado | Agregar como opción |
| **sfx/** | mmaudio (local) | ❌ No integrado | Agregar ElevenLabs SFX |
| **music/** | diffrhythm (local) | ❌ No integrado | Agregar Eleven Music |
| **translate/** | argos (local) | N/A | No aplica |
| **voices/** | Local storage | ⚡ TTS existe | Mejorar clonación |

## Módulos que FALTAN CREAR

| Módulo Nuevo | Servicio ElevenLabs | Minutos/mes |
|--------------|---------------------|-------------|
| **voice-changer/** | Voice Changer API | 30 min |
| **voice-isolator/** | Audio Isolation API | 30 min |
| **dubbing/** | Dubbing API | 6 min video |

## Plan de Implementación

### Fase 1: Integrar ElevenLabs en módulos existentes
1. ✅ **dictate/** - STT ya implementado, agregar a UI
2. ⏳ **transcribe/** - Agregar ElevenLabs como provider
3. ⏳ **sfx/** - Agregar ElevenLabs Sound Effects
4. ⏳ **music/** - Agregar Eleven Music

### Fase 2: Crear módulos nuevos
5. 🆕 **voice-changer/** - Transformar voz de audio
6. 🆕 **voice-isolator/** - Separar voz de ruido
7. 🆕 **dubbing/** - Doblaje automático de videos

### Fase 3: Mejoras avanzadas
8. ⏳ **STT Realtime** - WebSocket para dictado en vivo (50 min)
9. ⏳ **Clonación mejorada** - Usar las 10 voces del plan

## APIs de ElevenLabs a Investigar

1. `POST /v1/speech-to-text` - Transcripción de audio
2. `WS /v1/speech-to-text/stream` - STT en tiempo real
3. `POST /v1/voice-changer` - Cambio de voz
4. `POST /v1/sound-generation` - Efectos de sonido
5. `POST /v1/audio-isolation` - Aislamiento de voz
6. `GET /v1/user/subscription` - Ver uso actual de créditos

## Documentación Relevante
- https://elevenlabs.io/docs/api-reference/speech-to-text
- https://elevenlabs.io/docs/api-reference/voice-changer
- https://elevenlabs.io/docs/api-reference/sound-generation

## Archivos a Modificar

### Backend
- `ui/backend/stt_service.py` - Agregar provider ElevenLabs STT
- `ui/backend/providers/catalog.py` - Registrar nuevos servicios
- Crear: `ui/backend/elevenlabs_services.py` - Voice Changer, Isolator, etc.

### Frontend
- `ui/frontend/src/app/settings/page.tsx` - UI para nuevos servicios
- Crear página para Voice Changer, Sound Effects, etc.

## Estado Actual del Código ElevenLabs

Archivos existentes:
- `ui/backend/tts_providers/api/elevenlabs.py` - Solo TTS
- `ui/backend/provider_catalog.py` - Solo registra TTS

## Objetivo Final

Aprovechar al máximo la suscripción de ElevenLabs integrando todos los servicios disponibles en Whisperall, especialmente el **STT que ya está pagado** y no estamos usando.

---

## Cambios Realizados (2026-01-20)

### ElevenLabs STT Implementado

**Archivos modificados:**
- `ui/backend/stt_service.py` - Agregado método `_transcribe_elevenlabs()`
- `ui/backend/provider_catalog.py` - Actualizado elevenlabs con `"supported": {"tts": True, "stt": True}`
- `ui/backend/providers/stt/registry.py` - Registrado ElevenLabsSTTProvider

**Archivo creado:**
- `ui/backend/providers/stt/elevenlabs.py` - Nuevo provider STT completo

**Características implementadas:**
- Soporte para modelos Scribe v1 y v2
- Detección automática de idioma
- Soporte para 90+ idiomas
- Diarización (identificación de hablantes)
- Timestamps a nivel de palabra

**Cómo usarlo:**
1. Ya tienes la API key de ElevenLabs configurada (la misma que usas para TTS)
2. Ve a Settings > Dictate y selecciona "ElevenLabs Scribe" como provider
3. Usa el dictado normalmente - ahora consumirá tus 10 horas gratis de STT

### Integración Completa de ElevenLabs (2026-01-20)

**Servicios implementados en esta sesión:**

#### 1. Sound Effects (SFX) - ElevenLabs Text-to-Sound
- **Backend:** `ui/backend/sfx_providers/elevenlabs_provider.py`
- **Registry:** Actualizado `ui/backend/sfx_providers/registry.py`
- **API:** `POST https://api.elevenlabs.io/v1/sound-generation`
- **Quota:** 750 segundos (~12.5 min) por mes
- **Uso:** Ve a Sound Effects > Selecciona ElevenLabs como provider

#### 2. Voice Changer (Speech-to-Speech)
- **Backend:** `ui/backend/voice_changer/service.py`
- **Frontend:** `ui/frontend/src/app/voice-changer/page.tsx`
- **API:** `POST https://api.elevenlabs.io/v1/speech-to-speech/{voice_id}`
- **Quota:** 30 min por mes
- **Uso:** Menu > More Tools > Voice Changer

#### 3. Voice Isolator (Audio Isolation)
- **Backend:** `ui/backend/voice_isolator/service.py`
- **Frontend:** `ui/frontend/src/app/voice-isolator/page.tsx`
- **API:** `POST https://api.elevenlabs.io/v1/audio-isolation`
- **Quota:** 30 min por mes
- **Uso:** Menu > More Tools > Voice Isolator

#### 4. Auto Dubbing
- **Backend:** `ui/backend/dubbing/service.py`
- **Frontend:** `ui/frontend/src/app/dubbing/page.tsx`
- **API:** `POST https://api.elevenlabs.io/v1/dubbing`
- **Quota:** 6 min de video por mes (con watermark en Starter)
- **Idiomas:** 32+ idiomas soportados
- **Uso:** Menu > More Tools > Auto Dubbing

**Endpoints API agregados a main.py:**
- `/api/voice-changer/*` - Voice transformation
- `/api/voice-isolator/*` - Noise removal
- `/api/dubbing/*` - Auto dubbing

**Navegación actualizada:**
- Sidebar.tsx ahora incluye accesos directos a todos los nuevos módulos

### Estado Actualizado de Servicios ElevenLabs

| # | Servicio | Minutos/mes | Estado |
|---|----------|-------------|--------|
| 1 | TTS (máxima calidad) | 30 min | ✅ Implementado |
| 2 | TTS (Turbo/Flash) | 60 min | ✅ Implementado |
| 3 | API STT | 600 min (10h) | ✅ Implementado |
| 4 | STT Realtime (WebSocket) | 50 min | ❌ Pendiente |
| 5 | Voice Changer | 30 min | ✅ Implementado |
| 6 | Voice Isolator | 30 min | ✅ Implementado |
| 7 | Sound Effects | 12.5 min | ✅ Implementado |
| 8 | Eleven Music | 11 min | ❌ Pendiente (API diferente) |
| 9 | Doblaje Automático | 6 min video | ✅ Implementado |
| 10 | Voces personalizadas | 10 voces | ⚡ Parcial |

### Pendiente para Futuro

1. **STT Realtime (WebSocket)** - 50 min incluidos en Starter
2. **Eleven Music** - 11 min incluidos (API diferente a Sound Effects)
