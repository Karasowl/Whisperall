# Widget Whisperall - Estado y Pendientes

## Autor: Veritas (auditoría nocturna)
## Fecha: 2026-01-25
## Actualizado: 03:07 CST (clarificación de Ismael)

---

## IMPORTANTE: Alcance Correcto del Widget

**Ismael clarificó:** El widget solo debe tener DOS módulos:
1. **Dictate (STT)** - Dictar y auto-pegar texto
2. **Reader (TTS)** - Leer selección o clipboard

**NO implementar en el widget:**
- ~~TTS Input (escribir texto)~~ - No tiene sentido en un widget compacto
- ~~Transcribe~~ - Va en la app principal
- ~~Voice Library~~ - Va en la app principal

---

## Estado Actual del Widget

### Arquitectura
El widget es un "pill" compacto que expande a diferentes estados:
- **IDLE**: Barra mínima tipo "notch" (80x12px)
- **HOVER**: Botones Reader/Dictate (130x44px)
- **RECORDING**: Waveform + timer (220x48px)
- **TRANSCRIBING**: Spinner (220x48px)
- **COMPLETE**: Done + Undo (220x48px)
- **READER**: Controles de reproducción (280x48px)

### Funcionalidad Actual
1. **Reader** ✅ - Lee clipboard con TTS
2. **Dictate (STT)** ✅ - Graba voz y transcribe (conectado al backend real)

### Mejoras Implementadas (esta noche)
- [x] Control de velocidad funcional (1x, 1.25x, 1.5x, 2x, 2.5x, 3x, 4x)
- [x] Barra de progreso visual en Reader
- [x] Tooltips en todos los botones

---

## Pendientes Reales (verificar)

### 1. Hotkey para "copiar último texto dictado"
**Estado:** ✅ YA IMPLEMENTADO

- Hotkey: `stt_paste` (Alt+Shift+S por defecto)
- Función: `pasteLastTranscript()` en main.js
- Guarda el último texto en `lastSttTranscript` y lo pega

### 2. Persistencia de posición del widget
**Estado:** ✅ YA IMPLEMENTADO

- Función: `saveWidgetOverlayState()` en main.js
- Archivo: `widget-overlay.json` en userData
- Guarda: x, y, width, height, module activo

### 3. Configuración: Selección vs Clipboard
**Estado:** ❌ PENDIENTE

**Descripción:** En la app principal (Settings), opción para que Reader lea:
- Lo que está seleccionado en pantalla, O
- Lo que está en el clipboard

**Complejidad:** Media-Alta

**Desafío técnico:**
Leer la selección del sistema (fuera de Electron) en Windows requiere:
1. Simular Ctrl+C para copiar la selección actual
2. Leer el clipboard
3. Restaurar el clipboard al valor anterior

**Implementación propuesta:**
```javascript
// electron/main.js
const readSystemSelection = async () => {
  const snapshot = snapshotClipboard();          // Guardar clipboard actual
  await sendKeystroke({ key: 'c', modifiers: ['ctrl'] });  // Ctrl+C
  await sleep(100);                               // Esperar copia
  const selection = clipboard.readText();         // Leer selección
  restoreClipboard(snapshot);                     // Restaurar clipboard
  return selection;
};
```

**Archivos a modificar:**
- `electron/main.js` - Nueva función `readSystemSelection()`
- `electron/preload.js` - Exponer `readSelection()`
- `ui/backend/settings_service.py` - Nueva opción `reader.source` (clipboard|selection)
- `ui/frontend/src/app/settings/page.tsx` - UI para la opción
- `electron/widget-overlay.html` - Usar la opción

**Estimación:** 2-3 horas

---

## Diseño UX

- [x] Diseño discreto tipo "notch" (barra mínima en IDLE: 80x12px)
- [x] Animaciones de transición suaves
- [x] Movible/arrastrable (pointer events)
- [x] Persistencia de posición (widget-overlay.json)
- [x] Control de velocidad (1x-4x) ← Implementado esta noche
- [x] Barra de progreso visual ← Implementado esta noche
- [x] Tooltips en botones ← Implementado esta noche
- [ ] Verificar diseño en diferentes monitores/resoluciones

---

## NO Implementar (decisión de Ismael)

~~Sistema de tabs~~ - No necesario con solo 2 módulos
~~TTS Input~~ - No tiene sentido en widget compacto
~~Transcribe~~ - Va en la app principal
~~Voice Library~~ - Va en la app principal

---

## APIs Relevantes

### Para Dictate (ya implementado)
- `POST /api/stt/start` - Iniciar sesión
- `POST /api/stt/stop` - Detener y obtener transcripción
- `api.pasteText(text)` - Pegar en cursor activo (preload.js)
- `api.setLastSttTranscript(text)` - Guardar último texto

### Para Reader (ya implementado)
- `POST /api/reader/speak` - Generar audio desde texto
- `api.readClipboard()` - Leer clipboard (preload.js)

### Para Configuración
- `GET /api/settings` - Obtener configuración
- `PUT /api/settings/...` - Actualizar configuración
- `GET /api/widget/settings` - Configuración específica del widget
- `PUT /api/widget/settings` - Actualizar configuración del widget
