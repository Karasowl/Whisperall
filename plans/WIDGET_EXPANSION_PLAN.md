# Plan de Expansión del Widget - Whisperall

## Autor: Veritas (auditoría nocturna)
## Fecha: 2026-01-25

---

## Estado Actual del Widget

### Arquitectura
El widget es un "pill" compacto que expande a diferentes estados:
- **IDLE**: Barra mínima (80x12px)
- **HOVER**: Botones Reader/Dictate (130x44px)
- **RECORDING**: Waveform + timer (220x48px)
- **TRANSCRIBING**: Spinner (220x48px)
- **COMPLETE**: Done + Undo (220x48px)
- **READER**: Controles de reproducción (280x48px)

### Módulos Actuales
1. **Reader** ✅ - Lee clipboard con TTS
2. **Dictate (STT)** ✅ - Graba voz y transcribe

### Mejoras Implementadas (esta noche)
- [x] Control de velocidad funcional (1x-4x)
- [x] Barra de progreso visual
- [x] Tooltips en todos los botones

---

## Módulos Faltantes (según errores_a_resolver_8.md)

### 1. TTS Input
**Descripción:** Escribir texto y generar voz (diferente a Reader que solo lee clipboard)

**Requisitos:**
- Cuadro de texto expandible
- Selector de modelo/voz
- Botón generar
- Usar controles de reproducción existentes (speed, pause, stop)

**Complejidad:** Media
**Estimación:** 2-4 horas

### 2. Transcribe (archivos)
**Descripción:** Subir/pegar link de video, mostrar progreso, copiar resultado

**Requisitos:**
- Input para URL o file picker
- Barra de progreso con porcentaje
- Área de texto para resultado
- Botón de copiar
- Conexión con `/api/transcribe/*` endpoints

**Complejidad:** Alta
**Estimación:** 4-6 horas

### 3. Voice Library
**Descripción:** Grabar/gestionar voces desde el widget

**Requisitos:**
- Botón grabar/detener
- Lista de voces guardadas
- Selector de modelo para generar
- Conexión con `/api/voices/*` endpoints

**Complejidad:** Alta
**Estimación:** 4-6 horas

---

## Cambio Arquitectónico Necesario

### Problema
El widget actual NO tiene sistema de tabs/navegación. Solo tiene estados que cambian basados en acciones (hover, click reader, click dictate).

### Solución Propuesta
Añadir una barra de navegación en la parte superior del widget cuando está expandido:

```
┌─────────────────────────────────────────┐
│ [R] [T] [S] [📁] [🎤]  ← Tab icons     │
├─────────────────────────────────────────┤
│                                         │
│   Contenido del módulo activo           │
│                                         │
└─────────────────────────────────────────┘

R = Reader (actual)
T = TTS Input (nuevo)
S = STT/Dictate (actual)
📁 = Transcribe (nuevo)
🎤 = Voice Library (nuevo)
```

### Implementación de Tabs

1. **Nuevo estado: MODULE_SELECT**
   - Se muestra cuando el usuario hace hover prolongado o click
   - Muestra los iconos de todos los módulos disponibles

2. **Estado del módulo activo**
   - Cada módulo tiene sus propios sub-estados
   - Reader: IDLE/PLAYING/PAUSED
   - TTS: IDLE/GENERATING/PLAYING
   - STT: IDLE/RECORDING/TRANSCRIBING/COMPLETE
   - Transcribe: IDLE/UPLOADING/PROCESSING/COMPLETE
   - Voice Library: IDLE/RECORDING/SAVED

3. **Persistencia del módulo activo**
   - Guardar en `widget-overlay.json`
   - Cargar al iniciar

---

## Prioridad de Implementación

1. **Fase 1: Sistema de Tabs** (prerequisito)
   - Implementar navegación entre módulos
   - Persistencia del módulo activo
   - Ajustar dimensiones dinámicamente

2. **Fase 2: TTS Input** (más simple)
   - Solo necesita input + generar + reproducir
   - Reutiliza controles del Reader

3. **Fase 3: Transcribe**
   - Más complejo por el manejo de archivos/URLs
   - Necesita progress tracking de larga duración

4. **Fase 4: Voice Library**
   - Más complejo por la gestión de voces
   - Puede depender de flujos de la app principal

---

## Endpoints Backend Disponibles

### Para TTS Input
- `POST /api/generate` - Generar audio desde texto
- `GET /api/tts/providers` - Listar providers
- `GET /api/tts/providers/{id}/voices` - Voces disponibles

### Para Transcribe
- `POST /api/transcribe/upload` - Subir archivo
- `POST /api/transcribe/import-link` - Importar desde URL
- `GET /api/transcribe/status/{job_id}` - Estado del job
- `POST /api/transcribe/{job_id}/export` - Exportar resultado

### Para Voice Library
- `GET /api/voices` - Listar voces
- `POST /api/voices` - Crear voz
- `DELETE /api/voices/{id}` - Eliminar voz
- `GET /api/voices/{id}/analyze` - Analizar voz

---

## Notas para Implementación

1. **El widget usa APIs del preload.js**
   - `api.netFetch()` para requests HTTP
   - `api.readClipboard()` para leer clipboard
   - `api.pasteText()` para pegar texto

2. **Estilos existentes**
   - Glassmorphism ya definido
   - Variables CSS para colores de acento
   - Transiciones suaves implementadas

3. **Consideraciones de UX**
   - El widget debe mantenerse compacto
   - Los módulos complejos pueden necesitar "card mode" más grande
   - Siempre debe haber forma de volver al estado minimal
