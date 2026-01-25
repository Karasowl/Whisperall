# Sistema de Captura de Audio Interno con Transcripción y Subtítulos en Tiempo Real

## Descripción del Requerimiento

Implementar un motor interno que:

1. **Captura de Audio del Sistema (Loopback)**
   - Escuche el audio interno del dispositivo Windows
   - Capture lo que el dispositivo emite a cualquier interfaz de sonido externa
   - Audio interno del laptop/PC en Windows

2. **Transcripción en Tiempo Real**
   - Usar el módulo ASR existente para transcribir el audio capturado
   - Tomar notas de meetings (Google Meet, Zoom, Teams, etc.)
   - Cualquier fuente de audio del sistema

3. **Reconocimiento de Speakers en Tiempo Real**
   - Diferenciar speakers sin usar Pyannote (buscar alternativa gratuita/local)
   - Diarización en tiempo real

4. **Subtítulos Overlay en Windows**
   - Ventana de subtítulos superpuesta sobre todas las aplicaciones
   - Similar a plataformas de streaming pero encima de todo
   - Arrastrables y posicionables entre monitores
   - Que se queden en la posición elegida

5. **Traducción en Tiempo Real (Opcional)**
   - Cuando se requiera, enviar transcripción a traducción en tiempo real
   - Cuando no, solo mostrar transcripción
   - Toggle para activar/desactivar traducción

## Casos de Uso

- Tomar notas de reuniones de Google Meet, Zoom, Teams
- Subtitular videos de YouTube en tiempo real
- Transcribir podcasts o streams
- Traducir contenido de audio en tiempo real
- Accesibilidad para usuarios con problemas de audición

## Prompt Original

"podemos tener un motor interno que escuche el audio del dispositivo, el que el dispositivo intenta emitir a cualquier interfaz de sonido externa, o sea el audio interno de la laptop en este caso ya que estamos en windows por ahora y que se puedan hacer cosas con ese audio, por ejemplo transcribirlo en el modulo de ASR y tomar notas de meetings de google meet o cualquier lugar donde este sonando el dispositivo con reconocimiento de speakers en tiempo real diferenciándolos sin pyannote? y que ayude también a poner subtítulos en la pc tipo plataforma de streaming pero por encima de todo ya que se use esa transcripción sumada a una traducción en tiempo real cuando se requiera o cuando no se requiere solamente la transcripción y tengamos subtítulos superpuestos en windows que podamos arrastrar y colocar en un lugar donde queramos entre monitores si se quiere y que se queden en ese lugar?"

---

## Análisis Técnico Completado

### Recursos Existentes en el Codebase

1. **Sistema de Overlay (electron/main.js + electron/overlay.html)**
   - Ya existe ventana always-on-top, draggable, transparente
   - Guarda posición entre sesiones (`stt-overlay.json`)
   - IPC channels: `stt-overlay-show`, `stt-overlay-hide`, `stt-overlay-level`, `stt-overlay-state`
   - Puede extenderse para subtítulos

2. **ASR/Transcripción (ui/backend/)**
   - Faster-Whisper: `providers/stt/faster_whisper.py`
   - WhisperX: `whisperx_service.py`
   - Transcription service: `transcription_service.py`
   - Soporta streaming por chunks

3. **Diarización SIN Pyannote (ui/backend/diarization_service.py)**
   - Ya tiene fallback clustering usando `voice_analyzer.py`
   - Usa AgglomerativeClustering con cosine similarity
   - NO requiere HuggingFace token ni Pyannote
   - `_diarize_with_clustering()` línea 1053

4. **Traducción (ui/backend/)**
   - Argos: traducción local gratuita
   - DeepL/Google como opciones cloud

### Componentes a Implementar

1. **Audio Loopback Capture (NUEVO)**
   - **Tecnología**: WASAPI Loopback en Windows
   - **Librería recomendada**: `sounddevice` con soporte WASAPI
   - Alternativa: `pyaudiowpatch` (fork de PyAudio con loopback)

2. **Streaming ASR Pipeline**
   - Usar Faster-Whisper existente en modo chunked
   - Buffer de audio con VAD para detectar silencios
   - Procesar chunks de 2-5 segundos

3. **Diarización en Tiempo Real**
   - Usar el fallback clustering existente (`_diarize_with_clustering`)
   - Mantener banco de embeddings por sesión
   - Asignar speaker al chunk más reciente comparando con embeddings

4. **Subtitle Overlay (NUEVO)**
   - Extender overlay existente para mostrar texto
   - Nueva ventana `subtitle-overlay.html`
   - Configurable: tamaño fuente, colores, posición, opacidad

---

## Plan de Implementación

### Fase 1: Audio Loopback Service
**Archivo**: `ui/backend/loopback_service.py`

```python
# Captura audio del sistema usando WASAPI Loopback
# - Lista dispositivos de salida disponibles
# - Captura audio en chunks de 2-5 segundos
# - Emite chunks via WebSocket a frontend
# - Soporta start/stop/pause
```

**Dependencias**:
- `sounddevice` (ya en requirements)
- Verificar soporte WASAPI en Windows

### Fase 2: Streaming Transcription
**Modificar**: `ui/backend/main.py`

```python
# Nuevo endpoint WebSocket: /ws/loopback-transcribe
# - Recibe audio chunks del loopback service
# - Usa Faster-Whisper para transcripción
# - Aplica VAD para segmentar por silencios
# - Emite transcripciones parciales y finales
```

### Fase 3: Speaker Tracking en Tiempo Real
**Archivo**: `ui/backend/realtime_diarization.py`

```python
# Diarización simplificada para streaming
# - Mantiene banco de embeddings por speaker
# - Extrae embedding del chunk actual
# - Compara con banco usando cosine similarity
# - Asigna speaker existente o crea nuevo
# - NO requiere Pyannote - usa voice_analyzer.py
```

### Fase 4: Subtitle Overlay Window
**Archivos**:
- `electron/subtitle-overlay.html` (nuevo)
- `electron/main.js` (modificar)
- `electron/preload.js` (modificar)

```javascript
// Nueva ventana de subtítulos
// - Always-on-top, transparente, draggable
// - Muestra texto con speaker ID y color
// - Configurable: fuente, tamaño, posición, opacidad
// - Auto-scroll con historial reciente
// - Toggle traducción on/off
```

### Fase 5: Frontend Integration
**Archivos**:
- `ui/frontend/src/app/loopback/page.tsx` (nuevo)
- `ui/frontend/src/components/LoopbackControls.tsx` (nuevo)

```typescript
// Página de control para loopback
// - Selector de dispositivo de audio
// - Start/Stop/Pause buttons
// - Toggle overlay visibility
// - Toggle traducción
// - Configuración de idiomas
// - Lista de transcripciones en tiempo real
```

### Fase 6: Traducción Opcional
**Modificar**: WebSocket pipeline

```python
# Cuando traducción está activa:
# 1. Recibir transcripción
# 2. Enviar a Argos/DeepL para traducir
# 3. Emitir ambos: original y traducción
# 4. Overlay muestra traducción debajo del original
```

---

## Arquitectura de Comunicación

```
┌──────────────────┐
│  Windows Audio   │
│  (WASAPI Loop)   │
└────────┬─────────┘
         │ Audio chunks (2-5s)
         ▼
┌──────────────────┐
│ loopback_service │
│    (Backend)     │
└────────┬─────────┘
         │ WebSocket
         ▼
┌──────────────────┐     ┌──────────────────┐
│ Faster-Whisper   │────▶│ realtime_diariz  │
│ (Transcription)  │     │ (Speaker ID)     │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         └──────────┬─────────────┘
                    │
         ┌──────────▼──────────┐
         │   Translation       │
         │   (Argos/DeepL)     │
         │   [Optional]        │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │   WebSocket to      │
         │   Frontend + Electron│
         └──────────┬──────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌────────┐   ┌────────────┐   ┌──────────┐
│ React  │   │ Subtitle   │   │ History  │
│ UI     │   │ Overlay    │   │ (SQLite) │
└────────┘   └────────────┘   └──────────┘
```

---

## Prioridad de Implementación

1. **P0 - Core**: Loopback capture + Streaming transcription
2. **P1 - Essential**: Subtitle overlay window
3. **P2 - Enhancement**: Speaker diarization
4. **P3 - Optional**: Real-time translation

---

## Dependencias a Verificar/Agregar

```
# requirements.txt
sounddevice>=0.4.6    # Ya existe, verificar WASAPI support
# pyaudiowpatch        # Alternativa si sounddevice no funciona
```

---

## Notas Técnicas

### WASAPI Loopback en Windows
- Requiere acceso a dispositivo de "loopback" del audio output
- `sounddevice` puede acceder con `device` específico
- Alternativa: usar `--wasapi-loopback` flag en PyAudio patched

### Diarización Sin Pyannote
El codebase YA tiene implementación funcional:
- `diarization_service.py:_diarize_with_clustering()`
- Usa `voice_analyzer.py` para extraer embeddings
- AgglomerativeClustering con cosine similarity
- No requiere tokens ni modelos externos de pago

### Overlay Multi-Monitor
- Electron ya soporta `screen.getAllDisplays()`
- Guardar posición relativa a display
- Restaurar en el display correcto al reiniciar
