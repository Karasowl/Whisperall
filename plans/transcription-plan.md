# Plan: Transcripcion tipo TurboScribe (4GB/5h)

## Objetivo
Subir audio/video largo (hasta 5 horas, 4GB), transcribir con faster-whisper (CUDA), identificar hablantes (diarizacion), timestamps editables, exportar a TXT/SRT/VTT.

**Rendimiento esperado RTX 4060:**
- 2h de audio -> ~10 min procesamiento
- 5h de audio -> ~25 min procesamiento

---

## Estado: 90% Implementado

| Componente | Estado |
|------------|--------|
| `transcription_service.py` | Completado - faster-whisper + CUDA |
| `diarization_service.py` | Completado - VoiceEncoder + clustering |
| `export_utils.py` | Completado - TXT/SRT/VTT |
| `/transcribe/page.tsx` | Completado - Upload, progreso, editor |
| `TranscriptEditor.tsx` | Completado - Editor con audio sync |
| `ExportModal.tsx` | Completado - Modal exportacion |
| Endpoints en main.py | Completado - 6 endpoints |
| API functions en api.ts | Completado |
| Navigation | Completado |

---

## Pendiente: Soporte Archivos 4GB

### Problema 1: Upload carga todo en memoria
**Ubicacion:** `ui/backend/main.py:1764`
```python
content = await file.read()  # 4GB en RAM = crash
```
**Solucion:** Streaming en chunks de 1MB

### Problema 2: Sin limite de tamano configurado
FastAPI default: ~1MB. Archivos grandes seran rechazados.
**Solucion:** Configurar uvicorn con limit_max_body_size=5GB

---

## Archivos a Modificar

| Archivo | Linea | Cambio |
|---------|-------|--------|
| `ui/backend/main.py` | 1764-1766 | Streaming en chunks |
| `ui/backend/main.py` | 1782 | Usar file_size calculado |
| `ui/backend/main.py` | 2370-2371 | Agregar limit_max_body_size |

---

## Endpoints API

```
POST /api/transcribe/upload        -> Subir archivo, iniciar job
GET  /api/transcribe/status/{id}   -> Estado y segmentos del job
PUT  /api/transcribe/{id}/segments -> Guardar ediciones
POST /api/transcribe/{id}/export   -> Descargar TXT/SRT/VTT
DELETE /api/transcribe/{id}        -> Eliminar job
GET  /api/transcribe/history       -> Listar jobs recientes
```

---

## Verificacion

1. Subir archivo 100MB, verificar funciona
2. Subir archivo 1GB, verificar memoria estable
3. Subir archivo 2-4GB, verificar no crash
4. Archivo 30min, verificar progreso y diarizacion
5. Descargar TXT/SRT/VTT, verificar formato correcto
