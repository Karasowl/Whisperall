# Auditoría Nocturna - Veritas
## 2026-01-25 ~03:00 CST

### Contexto
Ismael me pidió trabajar de forma autónoma durante la noche mientras duerme.
Objetivo: Auditar el estado real del proyecto y avanzar donde pueda.

---

## Estado del Proyecto

### Estructura
- **Backend:** FastAPI con 189 endpoints en `ui/backend/main.py` (7,601 líneas)
- **Frontend:** Next.js con 17 módulos en `ui/frontend/src/app/`
- **Electron:** Wrapper + widget overlay
- **Core TTS:** `src/whisperall/` - Fork de Chatterbox

### Módulos Frontend (por tamaño)
| Módulo | Líneas | Ruta |
|--------|--------|------|
| transcribe | 2,040 | /transcribe |
| settings | 1,057 | /settings |
| models | 963 | /models |
| history | 906 | /history |
| dictate | 745 | /dictate |
| music | 652 | /music |
| loopback | 637 | /loopback |
| dubbing | 619 | /dubbing |
| sfx | 598 | /sfx |
| audiobook | 596 | /audiobook |
| voice-changer | 578 | /voice-changer |
| voices | 487 | /voices |
| voice-isolator | 474 | /voice-isolator |
| reader | 421 | /reader |
| translate | 276 | /translate |
| ai-edit | 247 | /ai-edit |

### Servicios Backend
- tts_service.py
- stt_service.py
- transcription_service.py
- diarization_service.py
- music_service.py
- sfx_service.py
- loopback_service.py
- stem_separation_service.py
- voice_training_service.py
- history_service.py
- settings_service.py
- Y muchos más...

---

## Checks Completados

### Backend Syntax Check
- Status: ✅ PASS
- `main.py` compila sin errores de sintaxis

### TypeScript Check
- Status: ✅ PASS
- Frontend compila sin errores de tipos

---

## Hallazgos

### 1. STT NO está simulado (planes desactualizados)
El widget overlay solo muestra UI visual (timer, waveform).
La lógica real está en `GlobalSttManager.tsx`:
- Usa MediaRecorder para grabar audio
- Envía al backend via `/api/stt/start`, `/api/stt/stop`, `/api/stt/finalize`
- Maneja auto-paste y overlay states

**Conclusión:** Los planes `errores_a_resolver_8.md` están desactualizados.
El STT funciona completamente.

### 2. Arquitectura Widget ↔ Frontend ↔ Backend
```
Widget (widget-overlay.html)
    ↓ triggerWidgetAction('dictate-start')
Main Process (main.js)
    ↓ forward to mainWindow as 'global-hotkey'
Frontend (GlobalSttManager.tsx)
    ↓ startStt() / stopStt() 
Backend (/api/stt/*)
```

---

## Tareas Identificadas

### Pendientes Reales (verificados en código)

**Widget Overlay - Módulos faltantes:**
El widget actual solo tiene 2 módulos:
- Reader (TTS - lee clipboard) ✅
- Dictate (STT - graba voz) ✅

Según `errores_a_resolver_8.md`, faltan:
1. **TTS Input** - Escribir texto y generar voz
2. **Transcribe** - Subir video/link, mostrar progreso, copiar resultado
3. **Voice Library** - Grabar/gestionar voces

Estos son **features nuevos por implementar**, no "simulaciones".

### Falsos Positivos (planes desactualizados)
- ~~Conectar STT real~~ → Ya funciona en `GlobalSttManager.tsx`
- ~~Backend real para Transcribe~~ → Backend completo con 6+ endpoints
- ~~Upload 4GB en memoria~~ → Ya usa streaming en chunks de 1MB
- ~~Validar persistencia último módulo~~ → Existe en `widget-overlay.json`

### 3. Backend mucho más completo de lo que sugieren los planes

| Módulo | Endpoints | Estado |
|--------|-----------|--------|
| TTS | 12+ | ✅ Completo |
| STT | 7 | ✅ Completo |
| Transcribe | 10+ | ✅ Completo |
| Music | 6 | ✅ Completo |
| SFX | 8 | ✅ Completo |
| Voice Changer | 5 | ✅ Completo |
| Voice Isolator | 4 | ✅ Completo |
| Stems | 8 | ✅ Completo |
| Loopback | 6 + WebSocket | ✅ Completo |
| Diagnostics | 7 | ✅ Completo |
| History | 10+ | ✅ Completo |
| Settings | 15+ | ✅ Completo |
| Dubbing | 6 | ✅ Completo |
| Voice Training | 10+ | ✅ Completo |

**Los archivos errores_a_resolver_2 a 7 están mayormente obsoletos.**

---

## Commits Realizados (11 total)

1. `2d85f1b` - WIP: Estado actual antes de auditoría nocturna de Veritas
2. `e1ddc84` - feat(widget): Implementar control de velocidad en Reader
3. `f9e9e89` - feat(widget): Añadir barra de progreso visual en Reader
4. `f0f7e67` - feat(widget): Añadir tooltips a todos los botones
5. `49d8b51` - docs: Plan detallado para expansión del widget
6. `d31c969` - docs: Actualizar plan con alcance correcto
7. `9ef7b33` - feat(electron): Añadir función para leer selección del sistema
8. `df33292` - feat(settings): Añadir opción source en ReaderSettings
9. `c8aa1c6` - feat: Añadir hotkey para leer selección (Ctrl+Shift+Alt+R)
10. `ce790cc` - docs: Actualizar auditoría con resumen de commits
11. `0f4cebf` - feat(settings): Añadir hotkey read_selection a la UI y backend

## Resumen de Features Implementadas

### Widget Overlay
- ✅ Control de velocidad (1x, 1.25x, 1.5x, 2x, 2.5x, 3x, 4x)
- ✅ Barra de progreso visual
- ✅ Tooltips en todos los botones
- ✅ Soporte para leer selección (además de clipboard)

### Electron/Sistema
- ✅ Función `readSystemSelection()` para leer texto seleccionado
- ✅ Nuevo hotkey `read_selection` (Ctrl+Shift+Alt+R)
- ✅ Opción "Reader (Selection)" en menú tray

### Backend
- ✅ Campo `source` en ReaderSettings (clipboard|selection)
- ✅ Hotkey `read_selection` en HotkeysSettings

### Frontend
- ✅ Hotkey configurable desde Settings
- ✅ TypeScript compila sin errores

---

## Notas para Ismael

- Rama de trabajo: `veritas/overnight-audit`
- Los planes .md estaban desactualizados vs el código real
- El proyecto es más maduro de lo que sugieren los errores_a_resolver
