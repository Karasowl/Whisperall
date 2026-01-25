# Errores a Resolver 5: Integración Completa del Historial

## Problema Principal

Actualmente el historial no está integrado de forma consistente en todos los módulos. Cada generación/proceso debe guardarse con su contexto completo para permitir:
- Revisión posterior
- Regeneración
- Seguimiento de uso/créditos
- Filtrado y búsqueda

## Requisitos Generales para TODOS los Módulos

### Metadata Base (común a todos)
| Campo | Descripción |
|-------|-------------|
| `id` | UUID único de la entrada |
| `module` | Nombre del módulo (tts, stt, transcribe, voice-changer, etc.) |
| `provider` | Provider usado (elevenlabs, groq, local, etc.) |
| `model` | Modelo específico (eleven_multilingual_v2, whisper-large-v3, etc.) |
| `created_at` | Fecha y hora de creación |
| `duration_seconds` | Duración del audio/video procesado |
| `credits_used` | Créditos consumidos (si aplica API) |
| `cost_type` | Tipo de costo: "credits", "minutes", "characters", "free" |

### Funcionalidades Comunes
1. **Copiar** - Copiar texto/resultado al portapapeles
2. **Regenerar** - Volver a procesar con mismos parámetros
3. **Descargar** - Descargar archivos generados
4. **Eliminar** - Borrar entrada del historial
5. **Filtros** - Por fecha, módulo, modelo, provider

---

## Integración por Módulo

### 1. TTS (Text-to-Speech) - Ya parcialmente implementado
**Guardar:**
- Texto de entrada
- Audio generado (.mp3/.wav)
- Voz usada (voice_id, nombre)
- Configuración (stability, similarity, style)

**Acciones:**
- Reproducir audio
- Copiar texto original
- Regenerar con misma voz
- Descargar audio

**Uso:** Caracteres procesados

---

### 2. STT / Dictate (Speech-to-Text en tiempo real)
**Guardar:**
- Audio grabado (.webm/.wav)
- Transcripción resultante
- Idioma detectado/usado

**Acciones:**
- Reproducir audio original
- Copiar transcripción
- **Regenerar transcripción** (re-procesar audio con otro modelo)
- Descargar audio
- Descargar transcripción (.txt/.srt)

**Uso:** Minutos de audio procesado

---

### 3. Transcribe (Archivos de audio/video)
**Guardar:**
- Ruta al archivo original (o copia)
- Transcripción completa
- Transcripción con timestamps
- Idioma detectado
- Número de hablantes (si diarización)

**Acciones:**
- Reproducir archivo original
- Copiar transcripción
- Regenerar con otro modelo
- Exportar (.txt, .srt, .vtt, .json)

**Uso:** Minutos de audio procesado

---

### 4. Voice Changer (Speech-to-Speech)
**Guardar:**
- Audio de entrada
- Audio transformado
- Voz objetivo usada
- Modelo usado

**Acciones:**
- Reproducir original vs transformado
- Descargar ambos audios
- Regenerar con otra voz

**Uso:** Minutos de audio procesado

---

### 5. Voice Isolator
**Guardar:**
- Audio de entrada (con ruido)
- Audio aislado (voz limpia)
- Provider usado

**Acciones:**
- Reproducir comparación (antes/después)
- Descargar audio limpio
- Regenerar con otro provider

**Uso:** Minutos de audio procesado

---

### 6. Dubbing (Auto-Doblaje)
**Guardar:**
- Video/audio original
- Video/audio doblado
- Idioma origen → destino
- Transcripción original
- Transcripción traducida

**Acciones:**
- Reproducir original vs doblado
- Descargar video doblado
- Copiar transcripciones
- Ver traducción lado a lado

**Uso:** Minutos de video procesado

---

### 7. SFX (Sound Effects)
**Guardar:**
- Prompt de texto
- Audio generado
- Duración solicitada
- Configuración (looping, prompt_influence)

**Acciones:**
- Reproducir audio
- Copiar prompt
- Regenerar con variaciones
- Descargar audio

**Uso:** Segundos generados / Créditos

---

### 8. Music
**Guardar:**
- Prompt/lyrics
- Audio generado
- Estilo/género
- Duración

**Acciones:**
- Reproducir música
- Copiar prompt/lyrics
- Regenerar
- Descargar audio

**Uso:** Segundos generados / Créditos (según provider)

---

### 9. AI Edit
**Guardar:**
- Texto original
- Instrucción de edición
- Texto editado
- Modelo LLM usado

**Acciones:**
- Copiar texto editado
- Ver diff (original vs editado)
- Regenerar edición
- Aplicar otra instrucción

**Uso:** Tokens LLM (si API) / Free (si local)

---

### 10. Translate
**Guardar:**
- Texto original
- Texto traducido
- Idioma origen → destino
- Modelo usado

**Acciones:**
- Copiar traducción
- Regenerar
- Invertir idiomas

**Uso:** Caracteres / Free (Argos local)

---

### 11. Reader
**Guardar:**
- Texto/URL leído
- Audio generado
- Voz usada
- Posición de lectura (para continuar)

**Acciones:**
- Continuar lectura
- Regenerar desde punto
- Descargar audio completo

**Uso:** Caracteres TTS

---

### 12. Audiobook
**Guardar:**
- Documento fuente (.epub, .pdf, .txt)
- Capítulos generados
- Voces por personaje
- Progreso de generación

**Acciones:**
- Continuar generación
- Reproducir capítulo
- Descargar audiolibro completo

**Uso:** Caracteres TTS

---

## Esquema de Base de Datos

### Tabla: `history_entries`
```sql
CREATE TABLE history_entries (
    id TEXT PRIMARY KEY,
    module TEXT NOT NULL,           -- 'tts', 'stt', 'transcribe', etc.
    provider TEXT NOT NULL,
    model TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Contenido (según módulo)
    input_text TEXT,                -- Texto de entrada (TTS, AI Edit, Translate)
    output_text TEXT,               -- Texto de salida (STT, Transcribe, Translate)
    input_audio_path TEXT,          -- Ruta audio entrada
    output_audio_path TEXT,         -- Ruta audio salida
    input_video_path TEXT,          -- Ruta video entrada
    output_video_path TEXT,         -- Ruta video salida

    -- Metadata específica (JSON)
    metadata JSON,                  -- Configuración específica del módulo

    -- Uso y costos
    duration_seconds REAL,          -- Duración procesada
    characters_count INTEGER,       -- Caracteres procesados
    credits_used REAL,              -- Créditos API consumidos
    cost_type TEXT,                 -- 'minutes', 'characters', 'credits', 'free'

    -- Estado
    status TEXT DEFAULT 'completed', -- 'completed', 'failed', 'processing'
    error_message TEXT,

    -- Organización
    favorite BOOLEAN DEFAULT FALSE,
    tags TEXT,                      -- JSON array de tags
    notes TEXT                      -- Notas del usuario
);

CREATE INDEX idx_history_module ON history_entries(module);
CREATE INDEX idx_history_created ON history_entries(created_at);
CREATE INDEX idx_history_provider ON history_entries(provider);
```

### Ejemplos de `metadata` por módulo

**TTS:**
```json
{
    "voice_id": "pNInz6obpgDQGcFmaJgB",
    "voice_name": "Adam",
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.0
}
```

**STT/Dictate:**
```json
{
    "language": "es",
    "language_detected": "Spanish",
    "word_timestamps": true,
    "diarization": false
}
```

**Voice Changer:**
```json
{
    "target_voice_id": "abc123",
    "target_voice_name": "Rachel",
    "model": "eleven_english_sts_v2"
}
```

**Dubbing:**
```json
{
    "source_language": "en",
    "target_language": "es",
    "num_speakers": 2,
    "watermark": true,
    "elevenlabs_project_id": "xyz789"
}
```

---

## API Endpoints

### Historial General
```
GET  /api/history                    - Listar historial (con filtros)
GET  /api/history/{id}               - Obtener entrada específica
DELETE /api/history/{id}             - Eliminar entrada
PATCH /api/history/{id}              - Actualizar (favorite, tags, notes)
GET  /api/history/{id}/download/{type} - Descargar archivo
POST /api/history/{id}/regenerate    - Regenerar con mismos parámetros
```

### Filtros soportados
```
GET /api/history?module=tts&provider=elevenlabs&from=2026-01-01&to=2026-01-31&model=eleven_multilingual_v2
```

### Estadísticas de uso
```
GET /api/history/stats               - Uso total por módulo/provider
GET /api/history/stats/monthly       - Uso mensual para tracking de quotas
```

---

## UI del Historial

### Vista Principal (`/history`)
1. **Filtros laterales:**
   - Por módulo (checkboxes)
   - Por provider
   - Por fecha (rango)
   - Por modelo
   - Favoritos

2. **Lista de entradas:**
   - Icono del módulo
   - Preview (texto truncado o thumbnail)
   - Fecha y hora
   - Provider/Modelo
   - Duración/Uso
   - Acciones rápidas (play, copy, download, delete)

3. **Vista detalle (modal o página):**
   - Contenido completo
   - Reproductor de audio/video
   - Metadata completa
   - Acciones: Regenerar, Copiar, Descargar, etc.

### Dashboard de Uso
- Gráficos de uso por mes
- Desglose por módulo
- Alertas de límites cercanos (ElevenLabs quotas)

---

## Archivos a Crear/Modificar

### Backend
- `ui/backend/history_service.py` - Servicio principal de historial
- `ui/backend/history_db.py` - Acceso a base de datos SQLite
- `ui/backend/main.py` - Nuevos endpoints de historial

### Frontend
- `ui/frontend/src/app/history/page.tsx` - Refactorizar página actual
- `ui/frontend/src/components/HistoryEntry.tsx` - Componente reutilizable
- `ui/frontend/src/components/HistoryFilters.tsx` - Panel de filtros
- `ui/frontend/src/components/HistoryDetail.tsx` - Modal/página de detalle
- `ui/frontend/src/lib/api.ts` - Funciones de API para historial

### Integración en cada módulo
Cada módulo debe llamar a `history_service.save_entry()` después de completar una operación:
- `tts_service.py`
- `stt_service.py`
- `transcribe_service.py`
- `voice_changer/service.py`
- `voice_isolator/service.py`
- `dubbing/service.py`
- `sfx_providers/*.py`
- `music_providers/*.py`

---

## Plan de Implementación

### Fase 1: Base de datos y servicio
1. Crear `history_db.py` con esquema SQLite
2. Crear `history_service.py` con operaciones CRUD
3. Agregar endpoints básicos en `main.py`

### Fase 2: Integrar módulos existentes
4. TTS - agregar guardado al historial
5. STT/Dictate - guardar audio + transcripción
6. Transcribe - guardar resultado

### Fase 3: Integrar módulos nuevos
7. Voice Changer - guardar entrada/salida
8. Voice Isolator - guardar antes/después
9. Dubbing - guardar video + metadata

### Fase 4: UI del historial
10. Refactorizar página de historial
11. Agregar filtros y búsqueda
12. Agregar vista de detalle con acciones

### Fase 5: Estadísticas y optimización
13. Dashboard de uso mensual
14. Alertas de límites
15. Limpieza automática de archivos antiguos

---

## Consideraciones

### Almacenamiento
- Los archivos de audio/video se guardan en `~/.whisperall/history/`
- Estructura: `history/{module}/{YYYY-MM}/{id}/`
- Limpieza opcional de archivos > X días

### Performance
- Paginación en listados
- Índices en campos de filtro
- Lazy loading de previews

### Privacidad
- Opción de no guardar en historial
- Exportar/Importar historial
- Eliminar todo el historial
