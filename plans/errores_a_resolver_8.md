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

### Modulos del Widget

#### 1. Text to Speech (TTS)
- Cuadro de texto expandible para escribir texto
- Genera voz con el modelo y voz elegidos
- Controles de reproduccion (play/pause)
- Selector de modelo y voz (persistente)
- Control de velocidad hasta x4

#### 2. Reader (Lector)
- Lee y reproduce automaticamente lo que copias o mandas con hotkeys
- Soporta hotkey de leer portapapeles
- Controles:
  - Pausar/Reanudar
  - Velocidad hasta x4
  - Cambiar voz
- Persistencia de configuracion (idioma, modelo, voz)

#### 3. Speech to Text (STT / Dictado)
- Boton de grabar
- Pega automaticamente donde tengas el cursor al terminar
- Streaming automatico (transcripcion en tiempo real)
- Pausar y continuar grabacion
- Al terminar, pega todo lo transcrito
- Persistencia de modelo

#### 4. Transcribe (Transcripcion)
- Pegar link de video/audio O subir archivo
- Muestra progreso en porcentaje durante el proceso
- Boton de copiar bonito al terminar
- Muestra el resultado de la transcripcion

#### 5. Voice Library (Biblioteca de Voces)
- Grabar una voz para usarla luego
- Generar voz segun el modelo elegido
- Gestionar voces guardadas

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
- `electron/widget-overlay.html` - HTML/CSS del widget glassmorfista
- `electron/widget-overlay.js` - Logica del widget (frontend Electron)

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

## Progreso Actual (23/01)
- [x] **Diseno**: Implementado "Pill Mode" con transicion fluida a "Card Mode".
- [x] **Funcionalidad**: Integrados Reader, TTS, STT, Transcribe y Library en el widget.
- [x] **Persistencia**: El widget carga configuraciones desde `/api/settings`.
- [x] **Interactive**: Hover/Click para expandir.

## Pendiente
- [ ] Validar persistencia de "Ultimo Modulo" (se guarda en `widget-overlay.json`).
- [ ] Conectar STT Real (actualmente es simulado/UI).
- [ ] Integrar Backend real para Transcribe (actualmente simulado).
- [ ] Pulir estilos visuales segun feedback.
