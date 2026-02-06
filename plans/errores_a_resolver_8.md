# Widget Flotante Multi-Modulo con Glassmorphism

## Prompt Original del Usuario (COPIA EXACTA)

> cuando le doy el hotkey de leer el clipbopard no aaprece una ventanita superpuesta en windows que lea, que se pueda pausar que se puedea aumentar la velocidad hasta x4 que se pueda cambiar la voz. no hay nada de eso y no hay persistencia de las configuraciones guardadeas en l real toime reader, idioma modelo voces. y todas esas ventanitas deberian ser estándares glassmorfistas y pequenas para estars superopuestas en windows coo un tool acces rapido y que la pudas mover de lugar dode quieras y perosta la pisicion cuando cierres y abras. y puedes cambiar de modulo. por ejeko en text to speech puedes escribir un texto en su ciadro de dialogo que se expande y dicho teto se genera en voz co el modelo y voz aue elijass , en reader lee y reproduce autmoaticanete ko que mandas a leer ya sea copiando en ella o con los jotjkeys de leer portatpapeles etc. el speech to text con el boton de grabar y pega automaticamnete cuando terminas donde tengas el cursor, debe ser algo asr streamenin automatico pero en todas persiste el modelo. y puedes pausar y seguir y luego al terminar pues ya se pega todo lo que grabaste y se trasncribio. en transcribe pueses pegar un link o subir un video y ya con eso comienza el proceso te muestra el proceso en porcemnjtaje y cuando terminas te muesta el boton de copiar bonito para ciopiarlo todo, en voince library te permite grabar una voz para usarla luego o generarla segun el modelo que elijas, todas tienen persistencia de modelo. luego implementaremos a furito los otros modulos en este windget redoneado y de poca altura y estiliczado, y seimpre teda un bton icono simple que te indica y te ayuda a ir a la ventana princiopal dlel programa de eese modulo con la info que ya estas trabajando en el widgwt. graba todo esto que te dije en errores a rresolver 8 y comeina a resolverlo

---

## Problema Actual

Cuando se presiona el hotkey para leer el clipboard (Ctrl+Shift+R), NO aparece una ventana superpuesta en Windows. En su lugar, abre la ventana principal de la app y navega a la pagina de Reader.

Ademas NO hay persistencia de las configuraciones guardadas en el Real Time Reader (idioma, modelo, voces).

## Requisitos del Widget Flotante

### Diseno Visual
- **Estilo**: Glassmorfismo (vidrio esmerilado, transparencia, blur)
- **Tamano**: Pequeno, compacto, de poca altura, estilizado
- **Posicion**: Superpuesto sobre todas las ventanas de Windows (always-on-top)
- **Movible**: Arrastrable a cualquier posicion de la pantalla
- **Persistencia de posicion**: Guardar y restaurar posicion al cerrar/abrir

### Scope Update (2026-02-03)

Para igualar el feeling de Wispr Flow y mantener el widget **super minimo** y **monetizable**, el widget v1 se reduce a:
- **Solo 2 modulos dentro del widget:** Dictate + Reader.
- Todo lo demas (Transcribe files, Voice Library, etc.) vive en la ventana principal.
- Opcion extra: **System Audio** (loopback) abre el modulo **Live Capture** en la ventana principal.

### Modulos del Widget (v1)

#### 1. Dictate (STT / Dictado)
- Estado ultra compacto (bar) + modo panel (interactivo) con animacion impecable.
- Start/Stop via hotkeys o boton.
- Visual feedback (waveform + timer + estados: recording/transcribing/done).
- Boton Undo (Ctrl+Z) cuando aplica.

#### 2. Reader (Clipboard TTS)
- Lee y reproduce automaticamente lo que copias o mandas con hotkeys.
- Controles: play/pause, stop, seek, velocidad hasta x4, cambiar voz.
- Persistencia: idioma/voz/velocidad via `/api/widget/settings`.

#### 3. Opcion Extra: System Audio
- Shortcut/boton: abre Live Capture (transcribe audio interno del sistema) en la ventana principal.

### Fuera de Scope (v1)
- Text to Speech (textbox dedicado en widget).
- Transcribe (subir archivo / pegar link) dentro del widget.
- Voice Library dentro del widget.

### Caracteristicas Generales

1. **Persistencia de Modelo**: Todas las pestanas/modulos persisten el modelo seleccionado
2. **Boton de Enlace**: Icono simple que lleva a la ventana principal del programa de ese modulo, con la info que ya estas trabajando en el widget
3. **Navegacion entre Modulos**: Tabs o selector para cambiar entre modulos
4. **Estandar de Diseno**: Todas las ventanitas siguen el mismo estilo glassmorfista

### Controles de Reproduccion (Reader/TTS)
- Play/Pause
- Velocidad: 0.5x, 1x, 1.5x, 2x, 2.5x, 3x, 4x
- Cambio de voz en tiempo real (si el provider lo soporta)
- Barra de progreso visual

### Persistencia de Configuracion
- Idioma seleccionado
- Modelo seleccionado
- Voz seleccionada
- Velocidad preferida
- Posicion del widget en pantalla
- Ultimo modulo activo

## Arquitectura Propuesta

### Archivos Nuevos
- `electron/widget-overlay.html` - HTML/CSS/JS del widget glassmorfista

### Archivos a Modificar
- `electron/main.js` - Nueva ventana overlay para widget
- `electron/preload.js` - APIs expuestas para el widget
- `ui/backend/main.py` - Endpoints para persistencia de configuracion del widget
- `ui/backend/settings_service.py` - Nuevas configuraciones del widget

### Flujo de Datos
```
Hotkey (Ctrl+Shift+R)
    |
    v
Electron Main Process
    |
    v
Muestra Widget Overlay (si no esta visible)
    |
    v
Widget lee clipboard automaticamente
    |
    v
Envia texto a backend /api/reader/speak
    |
    v
Recibe audio y reproduce en widget
    |
    v
Usuario puede pausar, cambiar velocidad, cambiar voz
```

## Prioridad de Implementacion

## Progreso Actual (2026-02-03)
- [x] Widget overlay always-on-top responde instantaneo a hotkeys.
- [x] Modo **bar** (minimo) + modo **panel** (interactivo) con animacion.
- [x] Reader: read clipboard, play/pause/stop, seek, speed, voice cycling.
- [x] Persistencia widget: `/api/widget/settings` (reader speed/voice/language + currentModule).
- [x] Dictate: estados recording/transcribing/done + undo.

## Cierre (v1)
- [x] Pulir estilo (tipografia, spacing) y micro-interactions (primer pase) para acercarlo a Wispr Flow.
- [x] Click-through en margenes transparentes (Electron `setIgnoreMouseEvents`) para que no bloquee clicks debajo.

## Futuro (opcional)
- [ ] Si System Audio se vuelve core: flujo directo desde widget (start/stop loopback) en vez de abrir pagina.
