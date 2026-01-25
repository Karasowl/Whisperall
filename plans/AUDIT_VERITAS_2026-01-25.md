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

---

## Commits Realizados

1. `2d85f1b` - WIP: Estado actual antes de auditoría nocturna de Veritas

---

## Notas para Ismael

- Rama de trabajo: `veritas/overnight-audit`
- Los planes .md estaban desactualizados vs el código real
- El proyecto es más maduro de lo que sugieren los errores_a_resolver
