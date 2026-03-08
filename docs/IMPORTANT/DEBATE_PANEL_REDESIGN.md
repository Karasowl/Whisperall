# Debate Society Panel -- Complete Redesign Specification

> Senior Product Design + UX Writing deliverable
> Target: Premium-quality AI assistant panel for WhisperAll notes editor
> Panel width: 360px (expanded), 44px (collapsed)
> Design system: Dark-only, Inter, Material Symbols, #137fec primary

---

## 1. VISUAL ARCHITECTURE

### Problem diagnosis

The current 580-line component dumps seven distinct functional zones into a single vertical scroll, all visible at once. There is no visual hierarchy -- the user sees a textarea, buttons, a dropdown, a message list, apply buttons, and a collapsible config drawer all fighting for attention. The result feels like a developer debug panel, not a polished product feature.

### Redesign principles

1. **Progressive disclosure** -- Show only what the current moment demands. First-time users see an inviting empty state. Active users see the conversation. Config stays behind a settings sheet.
2. **Three-zone layout** -- Header (fixed), Conversation (scrollable), Input bar (fixed at bottom). This mirrors every successful chat interface (iMessage, Linear comments, Notion AI).
3. **Clear visual lanes** -- Each message bubble has a consistent shape. The "curated result" is visually elevated above internal turns. Apply actions are contextual, not always visible.
4. **Breathing room** -- 12px padding on sides, 8px gaps between messages, generous line heights. The panel is narrow (360px) so density must be carefully managed.

### New section order (top to bottom)

```
+------------------------------------------+
|  HEADER BAR (fixed, 48px)                |
|  [<] Asistente IA     [settings] [chat+] |
+------------------------------------------+
|                                          |
|  CONVERSATION AREA (flex-1, scrollable)  |
|                                          |
|  Empty state / Message bubbles /         |
|  Curated result card / Status badges     |
|                                          |
+------------------------------------------+
|  INPUT BAR (fixed, auto height)          |
|  [textarea]  [Run] [Play/Pause]          |
|  Context badge: "Seleccion (240 chars)"  |
+------------------------------------------+
```

### What changed

| Before | After |
|--------|-------|
| Prompt input at top | Input bar at bottom (chat convention) |
| Action buttons mixed with prompt | Run + Play/Pause in input bar |
| Chat selector between prompt and messages | Chat selector in header dropdown |
| Apply buttons always visible in footer | Apply actions on the curated result card |
| Config always in page flow | Config in a slide-over settings sheet |
| Provider info as inline text | Provider badge in header, scope badge in input |
| 7 zones, 0 separators | 3 zones, 2 fixed bars |

---

## 2. UX FLOW

### 2.1 First-time user (never used the panel)

1. User opens a note. The panel is collapsed (44px rail, just the toggle icon).
2. User clicks the toggle. Panel expands to 360px.
3. They see the **empty state**: a centered illustration area with a headline and one-sentence explanation, plus a pulsing primary button "Ejecutar analisis".
4. They type an optional instruction in the bottom input bar and press the button.
5. The panel shows a skeleton loader (three pulsing lines), then the curated result card appears.
6. Below the curated result, a subtle "Aplicar al editor" row shows insert/replace/append as icon buttons with tooltips.
7. The user clicks "Insertar" and sees the text appear in their note.

### 2.2 Power user (daily use)

1. Panel is already open (state is persisted per note).
2. User types a new instruction in the bottom input bar, presses Enter or clicks Run.
3. Previous messages scroll up. The new cycle runs. A "Procesando..." badge appears on the header.
4. When done, the curated result card auto-scrolls into view at the bottom.
5. User clicks the insert icon on the card. Done.
6. If auto-play is active, a subtle pulsing blue dot appears in the header next to the timer countdown. Every N seconds, a new cycle runs automatically.

### 2.3 Switching notes

- When `noteId` changes, the panel smoothly resets: the conversation area transitions to the new note's debate state (loaded from localStorage, then hydrated from backend).
- The input bar clears.
- Config and subagents are per-note, so they follow the note.
- No jarring flash: use a 150ms opacity transition.

### 2.4 No selection in editor

- The context badge in the input bar reads "Nota completa (1,240 chars)" instead of "Seleccion (240 chars)".
- Behavior is the same: the AI receives the full note as context.
- The "Replace selection" apply action is disabled and shows a tooltip explaining why.

### 2.5 No applicable response

- If the AI returns a response that cannot be parsed as an edit command, the curated result card still appears.
- The apply actions row shows "Insertar" and "Anexar" enabled, "Reemplazar" disabled.
- A subtle info line appears: "La IA no sugirio una accion de edicion. Puedes insertar el texto manualmente."

---

## 3. TEXT WIREFRAMES (ASCII)

### 3.1 Collapsed state (44px width)

```
+----+
| [>]|   <-- Toggle button, centered vertically
|    |       Icon: right_panel_open
|    |       Tooltip: "Abrir asistente IA"
|    |
|    |
|    |
+----+
 44px
```

### 3.2 Empty state (no messages yet)

```
+------------------------------------------+
| [<]  Asistente IA          [cog] [chat+] |
+------------------------------------------+
|                                          |
|                                          |
|          .-------------------.           |
|          |   auto_awesome    |           |
|          |      (icon)       |           |
|          '-------------------'           |
|                                          |
|     Tu asistente de escritura con IA     |
|                                          |
|   Escribe una instruccion abajo o        |
|   presiona Ejecutar para analizar        |
|   tu nota con multiples perspectivas.    |
|                                          |
|      [ Ejecutar primer analisis ]        |
|                                          |
|                                          |
+------------------------------------------+
| Nota completa (0 chars)                  |
| +--------------------------------------+|
| | Instruccion para la IA (opcional)... ||
| +--------------------------------------+|
| [  Ejecutar  ]  [ |> Auto ]             |
+------------------------------------------+
 360px
```

### 3.3 Active conversation (messages present)

```
+------------------------------------------+
| [<]  Asistente IA   [*]     [cog] [ch+] |
+------------------------------------------+  * = provider badge: "GPT + Claude"
|                                          |
| .--------- user message ---------------.|
| | "Mejora la introduccion de este       ||
| |  documento para un publico tecnico"   ||
| '---------------------------------------'|
|                                          |
| .-- OpenAI Principal (blue left bar) ---.|
| | La introduccion actual carece de un   ||
| | gancho tecnico. Sugiero abrir con     ||
| | una pregunta retorica sobre...        ||
| '---------------------------------------'|
|                                          |
| .-- Claude Principal (amber left bar) --.|
| | El tono es demasiado informal para    ||
| | un publico tecnico. Recomiendo...     ||
| '---------------------------------------'|
|                                          |
| .====== RESULTADO CURADO ===============.|
| | (elevated card, primary border)       ||
| |                                       ||
| | "La introduccion debe abrir con una   ||
| |  pregunta retorica que establezca..." ||
| |                                       ||
| | [insert] [replace] [append]  [undo]   ||
| '======================================='|
|                                          |
+------------------------------------------+
| Seleccion (240 chars)                    |
| +--------------------------------------+|
| | Nueva instruccion...                 ||
| +--------------------------------------+|
| [  Ejecutar  ]  [ || Pausar ]  30s       |
+------------------------------------------+
```

### 3.4 Running state (processing)

```
+------------------------------------------+
| [<]  Asistente IA  [spinner]  [cog][ch+] |
+------------------------------------------+
|                                          |
|  (previous messages scrolled up)         |
|                                          |
| .-- processing indicator ---------------.|
| |  |||  |||  |||  (skeleton pulse)      ||
| |  Analizando con OpenAI + Claude...    ||
| '---------------------------------------'|
|                                          |
+------------------------------------------+
| Seleccion (240 chars)                    |
| +--------------------------------------+|
| | (textarea disabled while running)    ||
| +--------------------------------------+|
| [ Procesando... ]  [ || Pausar ]         |
+------------------------------------------+
```

### 3.5 Auto-play active

```
+------------------------------------------+
| [<]  Asistente IA  [*blue-dot] [cog][c+] |
+------------------------------------------+
|                                          |
|  (conversation messages)                 |
|                                          |
|  .-- auto-play status bar --------------.|
|  | [pulsing dot]  Auto-debate activo    ||
|  | Proxima ejecucion en 24s             ||
|  '--------------------------------------'|
|                                          |
+------------------------------------------+
| Nota completa (3,200 chars)              |
| +--------------------------------------+|
| | Instruccion permanente (opcional)... ||
| +--------------------------------------+|
| [  Ejecutar  ]  [ || Pausar ]  cada 30s  |
+------------------------------------------+
```

### 3.6 Settings sheet (slides over conversation)

```
+------------------------------------------+
| [<]  Configuracion             [X cerrar]|
+------------------------------------------+
|                                          |
|  PROVEEDOR                               |
|  +------------------------------------+ |
|  | [OpenAI] [Claude] [Ambos]          | |
|  +------------------------------------+ |
|                                          |
|  RONDAS DE DEBATE          INTERVALO     |
|  +----------------+   +----------------+|
|  | [  2  ] [-][+] |   | [ 30s ] [-][+] ||
|  +----------------+   +----------------+|
|                                          |
|  ----------------------------------------|
|                                          |
|  SUBAGENTES                              |
|                                          |
|  .-- Analista ------ [auto v] [trash] --.|
|  | Encontrar mejoras practicas para     ||
|  | el contexto actual.                  ||
|  | [ ] Modo critico                     ||
|  '--------------------------------------'|
|                                          |
|  .-- Critico ------- [auto v] [trash] --.|
|  | Cuestionar suposiciones debiles,     ||
|  | detectar riesgos y pedir evidencia.  ||
|  | [x] Modo critico                     ||
|  '--------------------------------------'|
|                                          |
|  [ + Agregar subagente ]                 |
|                                          |
+------------------------------------------+
```

### 3.7 Error state (no credentials)

```
+------------------------------------------+
| [<]  Asistente IA          [cog] [chat+] |
+------------------------------------------+
|                                          |
|                                          |
|          .-------------------.           |
|          |    vpn_key_off    |           |
|          |      (icon)       |           |
|          '-------------------'           |
|                                          |
|     Conecta un proveedor de IA           |
|                                          |
|   Para usar el asistente, conecta        |
|   OpenAI o Claude en Configuracion.      |
|                                          |
|       [ Abrir Configuracion ]            |
|                                          |
|                                          |
+------------------------------------------+
| (input bar hidden when no credentials)   |
+------------------------------------------+
```

---

## 4. COMPONENT HIERARCHY

### Always visible (fixed)

| Element | Position | Height |
|---------|----------|--------|
| Header bar | Top | 48px |
| Input bar | Bottom | auto (min 80px, max 160px) |

### Main content (scrollable, flex-1)

| Element | Visibility |
|---------|-----------|
| Empty state | When no messages exist |
| Error state | When no AI credentials are configured |
| Message list | When messages exist |
| Curated result card | When last cycle produced a result |
| Auto-play status bar | When `play === true` |
| Skeleton loader | When `running === true` |

### Hidden by default (shown on demand)

| Element | Trigger |
|---------|---------|
| Settings sheet | Click gear icon in header |
| Session selector dropdown | Click chat title or [chat+] in header |

### Never simultaneously visible

- Empty state and Message list are mutually exclusive.
- Error state replaces both when credentials are missing.
- Settings sheet overlays the conversation area (slide from right, 300ms ease).
- Skeleton loader appears at the end of the message list during processing.

---

## 5. MICROCOPY (Spanish)

### 5.1 Header and navigation

| Key | Current | Redesigned |
|-----|---------|-----------|
| `debateTitle` | `Sociedad que Debate` | `Asistente IA` |
| `debateExpand` | `Abrir panel IA` | `Abrir asistente` |
| `debateCollapse` | `Colapsar panel IA` | `Cerrar asistente` |

**Rationale**: "Sociedad que Debate" is creative but opaque. Users scanning the UI need instant recognition. "Asistente IA" is universally understood.

### 5.2 Empty state

```
New keys:
  debateEmptyTitle:       "Tu asistente de escritura con IA"
  debateEmptyDesc:        "Escribe una instruccion abajo o presiona Ejecutar
                           para analizar tu nota con multiples perspectivas."
  debateFirstRun:         "Ejecutar primer analisis"
```

### 5.3 Input bar

| Key | Current | Redesigned |
|-----|---------|-----------|
| `debatePromptPlaceholder` | `Instruccion para esta ejecucion (opcional)...` | `Escribe una instruccion...` |
| `debateWriteHint` | `1) Escribe una instruccion y presiona Ejecutar ahora. Si hay texto seleccionado, se usa como foco.` | (removed -- replaced by context badge below input) |
| `debateRun` | `Ejecutar ahora` | `Ejecutar` |

### 5.4 Context badge (new)

```
New keys:
  debateContextSelection:  "Seleccion ({chars} chars)"
  debateContextViewport:   "Viewport ({chars} chars)"
  debateContextFull:       "Nota completa ({chars} chars)"
  debateContextEmpty:      "Nota vacia"
```

Shown as a small chip above the textarea. Communicates what the AI will "see" without a paragraph of explanation.

### 5.5 Conversation messages

| Key | Current | Redesigned |
|-----|---------|-----------|
| `debateCurated` | `Resultado curado` | `Resultado final` |
| `debateUser` | `Usuario` | `Tu` |
| `debateEmpty` | `Aun no hay mensajes de debate. Ejecuta una vez para iniciar.` | (replaced by structured empty state) |

### 5.6 Apply actions

| Key | Current | Redesigned |
|-----|---------|-----------|
| `debateApplyHint` | `2) Revisa la respuesta y aplica cambios en la nota.` | (removed -- actions are self-explanatory on the card) |
| `debateInsert` | `Insertar` | `Insertar` (keep) |
| `debateReplace` | `Reemplazar seleccion` | `Reemplazar` |
| `debateAppend` | `Anexar` | `Anexar al final` |
| `debateUndoAction` | `Deshacer edicion` | `Deshacer` |
| `debateNothingToApply` | `Aun no hay salida IA para aplicar.` | `Ejecuta el asistente primero para obtener una sugerencia.` |
| `debateNeedSelection` | `Selecciona texto antes de reemplazar.` | `Selecciona texto en el editor para usar Reemplazar.` |
| `debateApplied` | `Salida IA aplicada a la nota.` | `Aplicado al editor.` |

### 5.7 Auto-play

| Key | Current | Redesigned |
|-----|---------|-----------|
| `debatePlay` | `Iniciar debate automatico` | `Auto` |
| `debatePause` | `Pausar debate automatico` | `Pausar` |

```
New keys:
  debateAutoActive:        "Auto-debate activo"
  debateAutoNext:          "Proxima ejecucion en {seconds}s"
  debateAutoInterval:      "cada {seconds}s"
```

### 5.8 Settings sheet

| Key | Current | Redesigned |
|-----|---------|-----------|
| `debateShowConfig` | `3) Mostrar configuracion avanzada` | (removed -- replaced by gear icon) |
| `debateHideConfig` | `Ocultar configuracion avanzada` | (removed) |
| `debateProvider` | `Proveedor` | `Proveedor` (keep) |
| `debateRounds` | `Rondas` | `Rondas de debate` |
| `debateInterval` | `Cada (s)` | `Intervalo (seg)` |
| `debateCritical` | `Critico` | `Modo critico` |
| `debateAddSubagent` | `Agregar subagente` | `Agregar perspectiva` |

```
New keys:
  debateSettingsTitle:     "Configuracion"
  debateSubagentsTitle:    "Perspectivas"
  debateSubagentHint:      "Cada perspectiva analiza la nota desde un angulo diferente."
```

**Rationale**: "Subagente" is technical jargon. "Perspectiva" is friendlier and accurately describes the function: each agent provides a different perspective on the note.

### 5.9 Errors

| Key | Current | Redesigned |
|-----|---------|-----------|
| `debateNeedOpenai` | `OpenAI no esta conectado. Agrega API key o conecta OpenAI en Settings.` | `OpenAI no esta conectado. Ve a Configuracion para agregar tu API key.` |
| `debateNeedClaude` | `Claude no esta conectado. Agrega API key o conecta Claude en Settings.` | `Claude no esta conectado. Ve a Configuracion para agregar tu API key.` |
| `debateNeedBoth` | `El modo combinado requiere OpenAI y Claude conectados.` | `El modo combinado necesita ambos proveedores conectados.` |
| `debateRunFailed` | `La ejecucion del debate fallo.` | `El analisis fallo. Intenta de nuevo.` |
| `debateNoEditor` | `El editor aun no esta listo.` | `Espera a que el editor cargue.` |

```
New keys:
  debateNoCredentialsTitle:  "Conecta un proveedor de IA"
  debateNoCredentialsDesc:   "Para usar el asistente, conecta OpenAI o Claude en Configuracion."
  debateOpenSettings:        "Abrir Configuracion"
  debateNoSuggestion:        "La IA no sugirio una accion de edicion. Puedes insertar el texto manualmente."
```

### 5.10 Session management

| Key | Current | Redesigned |
|-----|---------|-----------|
| `debateChatLabel` | `Chat` | (removed -- integrated into header dropdown) |
| `debateNewChat` | `Nuevo chat` | `Nueva conversacion` |
| `debateRotated` | `El chat del debate se compacto y paso a una nueva sesion.` | `Conversacion archivada. Se inicio una nueva sesion.` |

---

## 6. SYSTEM STATES

### 6.1 Idle (default)

- Header: Static title "Asistente IA", no indicator.
- Input bar: Textarea enabled, placeholder text visible.
- Context badge: Shows current scope.
- Run button: Primary fill (#137fec), enabled.

### 6.2 Running (processing)

- Header: Small spinner icon replaces the provider badge.
- Message area: Skeleton loader at bottom (three lines, shimmer animation 1.5s linear infinite).
- Below skeleton: "Analizando con {provider}..." in text-muted, text-[11px].
- Input bar: Textarea disabled (opacity 40%), Run button shows "Procesando..." and is disabled.
- No other interaction is possible during a run.

### 6.3 Auto-play active

- Header: Small pulsing blue dot (w-2 h-2 rounded-full bg-primary, animate-pulse) next to the title.
- Between last message and input bar: A thin status bar with countdown.
  - Background: `bg-primary/5 border border-primary/15`.
  - Text: "Auto-debate activo -- Proxima ejecucion en {N}s".
  - Contains a small pause button.
- Input bar: "Auto" button shows active state (primary border, primary text, primary/10 bg).

### 6.4 No credentials

- Entire conversation area replaced by error empty state.
- Large icon: `vpn_key_off` (Material Symbols), 40px, text-muted/40.
- Title: "Conecta un proveedor de IA" (text-sm font-semibold).
- Description: "Para usar el asistente, conecta OpenAI o Claude en Configuracion." (text-xs text-muted).
- CTA button: "Abrir Configuracion" (outline style, border-primary text-primary).
- Input bar: Hidden (no point showing input when nothing can run).

### 6.5 Provider fallback

- When user selects "both" but only one provider is available:
- A one-time notification toast: "Solo OpenAI esta disponible. El asistente usara OpenAI."
- The header badge updates to show the effective provider.
- No blocking error -- graceful degradation.

### 6.6 Tool error (web search failed, API timeout)

- The run continues with available results. Failed tool calls show in conversation as:
  ```
  [search icon] Busqueda web -- Sin resultados
  ```
- Styled with `text-muted/60`, no red color (it is not a fatal error).

### 6.7 Saved / Synced

- No persistent visual indicator (unlike the editor's "Saved" badge). The panel auto-persists to localStorage on every state change and debounces to backend.
- If backend sync fails, a small warning icon (amber) appears in the header. Tooltip: "Los cambios estan guardados localmente. La sincronizacion con la nube fallo."

---

## 7. INTERACTION RULES

### 7.1 Note switching behavior

- When `noteId` changes (user clicks a different note in the list):
  1. If a run is in progress, it completes in the background but results are discarded (the ref check `debateRef.current.noteId !== noteId` prevents stale writes).
  2. Auto-play is paused (to prevent running on the wrong note).
  3. The panel loads the new note's debate state from localStorage, then attempts a backend hydration.
  4. The input bar clears.
  5. If the new note has never been used with the panel, the empty state appears.
  6. The settings sheet closes if open.

### 7.2 No selection behavior

- The context resolution order is preserved: selection > viewport > full note.
- The context badge updates in real-time as the user moves their cursor / scrolls:
  - "Seleccion (142 chars)" when text is selected.
  - "Viewport (890 chars)" when no selection but the editor is scrolled.
  - "Nota completa (3,200 chars)" when neither selection nor viewport is detected.
  - "Nota vacia" when the note has no content.
- The "Reemplazar" apply action is disabled when no selection exists. All other actions remain enabled.

### 7.3 No applicable response behavior

- The curated result card always appears, regardless of whether the AI returned an edit command.
- If `parseEditCommand()` returns null:
  - The "suggested mode" defaults to `insert`.
  - A subtle info line appears below the apply actions: "La IA no sugirio una accion de edicion. Puedes insertar el texto manualmente."
  - "Insertar" and "Anexar al final" are enabled. "Reemplazar" follows selection state.

### 7.4 Keyboard shortcuts

| Action | Shortcut |
|--------|----------|
| Run cycle | Ctrl+Enter (inside textarea) |
| Toggle auto-play | -- (button only, too dangerous for a hotkey) |
| Open settings | -- (button only) |
| Close settings | Escape |
| Toggle panel | -- (button only, to avoid conflict with editor shortcuts) |

### 7.5 Session management

- Sessions are accessed via a dropdown in the header (click the title "Asistente IA" to reveal).
- The dropdown shows all sessions with timestamps.
- "Nueva conversacion" button at the bottom of the dropdown.
- When a session is rotated (memory overflow), a toast notification appears: "Conversacion archivada. Se inicio una nueva sesion."

---

## 8. READABILITY IMPROVEMENTS

### 8.1 Contrast

| Element | Current | Recommended |
|---------|---------|-------------|
| Hint text | `text-muted` (#9dabb9) on `bg-base/25` | Same color is fine, 4.5:1 contrast ratio against #141c26 |
| Message body | `text-text` on colored bubble bg | Keep `text-text` (#f1f5f9) -- excellent contrast |
| Input placeholder | Browser default on `bg-base/70` | Use `placeholder:text-muted/50` for softer, less noisy placeholder |
| Apply button labels | `text-muted` | Use `text-text/70` for slightly better readability on interactive elements |
| Context badge | New element | `text-[11px] text-muted/80` on `bg-base/30 border-edge/50` |

### 8.2 Spacing

| Area | Current | Recommended |
|------|---------|-------------|
| Panel side padding | 8px (p-2) | 12px (p-3) |
| Message gap | 8px (space-y-2) | 10px (gap-2.5) |
| Header height | Variable (~40px) | Fixed 48px |
| Input bar padding | 12px (p-3) | 12px top, 16px bottom (for safe area) |
| Between context badge and textarea | None | 6px |
| Between textarea and button row | 8px | 8px (keep) |

### 8.3 Density recommendations

| Problem | Solution |
|---------|----------|
| Too many sections visible at once | Move config to overlay sheet, apply to curated card |
| Chat selector adds visual noise | Move to header dropdown |
| Numbered hints ("1)", "2)", "3)") add text bulk | Remove -- replace with layout conventions |
| Provider info badge between buttons | Move to header |
| 4 apply buttons in 2x2 grid | 4 icon buttons in a single row on the curated card |

### 8.4 Font sizes

| Element | Current | Recommended |
|---------|---------|-------------|
| Panel title | 12px (text-xs) | 13px (text-[13px]) -- slightly larger for hierarchy |
| Hint text | 11px | 11px (keep) |
| Message speaker label | 11px | 11px (keep) |
| Message body | 12px (text-xs) | 13px (text-[13px]) -- readable at panel width |
| Apply button labels | 12px (text-xs) | 11px (text-[11px]) -- secondary actions should be quieter |
| Config labels | 11px | 11px (keep) |
| Context badge | N/A | 11px |
| Input textarea | 12px | 13px (text-[13px]) -- match message body |

### 8.5 Grouping

- **Header**: Title + provider badge + settings gear + new session button. Single horizontal row, 48px.
- **Conversation**: Full vertical scroll. User messages right-aligned (or full-width with user icon), AI messages left-aligned with colored left border.
- **Curated card**: Visually distinct from regular messages. Slightly larger padding, primary-colored left border (4px), subtle `bg-primary/5` background. Apply actions row embedded at the bottom of this card.
- **Input bar**: Context badge (top), textarea (middle), buttons (bottom). Separated from conversation by a border-t.

---

## 9. UX ACCEPTANCE CRITERIA

### Must-pass (blocking for release)

- [ ] User can identify the panel's purpose within 5 seconds of opening it (validated by showing to 3 people unfamiliar with the feature).
- [ ] Empty state clearly communicates what the panel does and how to start.
- [ ] The input field is immediately obvious as the place to type instructions.
- [ ] "Ejecutar" button is the most prominent interactive element in the input bar.
- [ ] Messages are visually distinguishable by provider (OpenAI vs Claude vs user vs system).
- [ ] The curated result card is visually elevated above regular messages.
- [ ] Apply actions (insert, replace, append, undo) are reachable in 1 click from the curated result.
- [ ] "Reemplazar" is disabled when no text is selected in the editor, with a clear tooltip.
- [ ] Settings (provider mode, rounds, interval, subagents) are accessible but hidden by default.
- [ ] Auto-play state is visible in the header without scrolling.
- [ ] Error states (no credentials, run failed) show actionable recovery paths.
- [ ] Panel collapse/expand preserves conversation scroll position.
- [ ] Note switching loads the correct per-note state without flash.
- [ ] All text is in Spanish (matching `uiLanguage`).
- [ ] All interactive elements have `data-testid` attributes.
- [ ] Panel works correctly at 360px width with no horizontal overflow.
- [ ] The component stays under 200 lines by extracting sub-components.

### Should-pass (quality gate)

- [ ] Ctrl+Enter triggers run from the textarea.
- [ ] Escape closes the settings sheet.
- [ ] Conversation auto-scrolls to the latest message after a run completes.
- [ ] Skeleton loader appears within 100ms of starting a run.
- [ ] Settings sheet has a slide-in animation (200ms ease-out).
- [ ] Context badge updates within 500ms of selection change.
- [ ] Provider fallback shows a non-blocking notification.
- [ ] Session rotation shows a toast notification.
- [ ] Backend sync failure shows a subtle warning icon, not a blocking error.
- [ ] Message bubbles have a subtle enter animation (opacity 0 to 1, 150ms).

### Nice-to-have (polish)

- [ ] Typing in the textarea auto-resizes it (up to 4 lines, then scroll).
- [ ] Long curated results are truncated with "Mostrar mas" toggle.
- [ ] Subagent cards in settings have drag-to-reorder.
- [ ] Provider badge shows a subtle color animation when switching providers.
- [ ] Empty state illustration uses the auto_awesome Material Symbol with a subtle gradient glow.

---

## 10. IMPLEMENTATION GUIDANCE

### Component decomposition

Extract the current monolith into these sub-components:

```
components/notes/
  DebatePanel.tsx           -- Shell: collapse/expand, layout, state orchestration (~80 lines)
  DebatePanelHeader.tsx     -- Header bar: title, provider badge, settings/session buttons (~40 lines)
  DebatePanelMessages.tsx   -- Message list: scrollable area, message bubbles, empty state (~60 lines)
  DebatePanelCuratedCard.tsx-- Curated result card with apply actions (~50 lines)
  DebatePanelInput.tsx      -- Input bar: context badge, textarea, run/play buttons (~50 lines)
  DebatePanelSettings.tsx   -- Settings sheet overlay: provider, rounds, interval, subagents (~80 lines)
  DebatePanelEmptyState.tsx -- Empty state and error state (~30 lines)
```

Total: ~390 lines across 7 files (down from 580 in one file). Each file is under 100 lines, matching the project's style rule.

### CSS token mapping

```
Panel background:   bg-surface/55 backdrop-blur-sm     (keep current)
Header background:  bg-base/40 border-b border-edge     (darker than panel body)
Input bar bg:       bg-base/30 border-t border-edge      (subtle separation)
Message bubble:     rounded-lg px-3 py-2.5               (more generous padding)
  OpenAI:           border-l-[3px] border-l-blue-500/50 bg-blue-500/5
  Claude:           border-l-[3px] border-l-amber-500/50 bg-amber-500/5
  User:             border-l-[3px] border-l-primary/40 bg-primary/5
  System:           border-l-[3px] border-l-edge bg-base/30
Curated card:       border border-primary/30 bg-primary/5 rounded-xl p-3
Settings sheet:     fixed inset-y-0 right-0 w-[360px] bg-surface z-40
Context badge:      inline-flex text-[11px] text-muted/80 bg-base/30 px-2 py-0.5 rounded-full
Run button:         bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-lg
Play button:        border border-edge text-muted text-xs px-2.5 py-1.5 rounded-lg
  Active:           border-primary/40 text-primary bg-primary/10
```

### Message bubble design

The left-border approach (3px colored bar) is used instead of fully colored backgrounds because:
1. It maintains readability by keeping the bubble background very subtle.
2. It provides instant provider identification without reading the label.
3. It works well at 360px width where colored backgrounds can feel overwhelming.
4. It matches Linear's comment design language.

### Animation specs

| Animation | Property | Duration | Easing |
|-----------|----------|----------|--------|
| Panel expand/collapse | width | 200ms | ease-in-out (current, keep) |
| Settings sheet enter | transform (translateX) | 200ms | ease-out |
| Settings sheet exit | transform (translateX) | 150ms | ease-in |
| Message bubble enter | opacity | 150ms | ease-out |
| Skeleton shimmer | background-position | 1500ms | linear, infinite |
| Auto-play dot pulse | opacity | 2000ms | ease-in-out, infinite |
| Context badge update | opacity | 200ms | ease |

---

## 11. COMPLETE i18n KEY MAP

Below are all new and modified keys for both `en` and `es` dictionaries.

### New keys

```javascript
// English
'notes.debateEmptyTitle': 'Your AI writing assistant',
'notes.debateEmptyDesc': 'Write an instruction below or press Run to analyze your note from multiple perspectives.',
'notes.debateFirstRun': 'Run first analysis',
'notes.debateContextSelection': 'Selection ({chars} chars)',
'notes.debateContextViewport': 'Viewport ({chars} chars)',
'notes.debateContextFull': 'Full note ({chars} chars)',
'notes.debateContextEmpty': 'Empty note',
'notes.debateAutoActive': 'Auto-debate active',
'notes.debateAutoNext': 'Next run in {seconds}s',
'notes.debateAutoInterval': 'every {seconds}s',
'notes.debateNoCredentialsTitle': 'Connect an AI provider',
'notes.debateNoCredentialsDesc': 'To use the assistant, connect OpenAI or Claude in Settings.',
'notes.debateOpenSettings': 'Open Settings',
'notes.debateNoSuggestion': 'The AI did not suggest an edit action. You can insert the text manually.',
'notes.debateSettingsTitle': 'Settings',
'notes.debateSubagentsTitle': 'Perspectives',
'notes.debateSubagentHint': 'Each perspective analyzes the note from a different angle.',
'notes.debateNewConversation': 'New conversation',
'notes.debateSessionArchived': 'Conversation archived. A new session has started.',

// Spanish
'notes.debateEmptyTitle': 'Tu asistente de escritura con IA',
'notes.debateEmptyDesc': 'Escribe una instruccion abajo o presiona Ejecutar para analizar tu nota con multiples perspectivas.',
'notes.debateFirstRun': 'Ejecutar primer analisis',
'notes.debateContextSelection': 'Seleccion ({chars} chars)',
'notes.debateContextViewport': 'Viewport ({chars} chars)',
'notes.debateContextFull': 'Nota completa ({chars} chars)',
'notes.debateContextEmpty': 'Nota vacia',
'notes.debateAutoActive': 'Auto-debate activo',
'notes.debateAutoNext': 'Proxima ejecucion en {seconds}s',
'notes.debateAutoInterval': 'cada {seconds}s',
'notes.debateNoCredentialsTitle': 'Conecta un proveedor de IA',
'notes.debateNoCredentialsDesc': 'Para usar el asistente, conecta OpenAI o Claude en Configuracion.',
'notes.debateOpenSettings': 'Abrir Configuracion',
'notes.debateNoSuggestion': 'La IA no sugirio una accion de edicion. Puedes insertar el texto manualmente.',
'notes.debateSettingsTitle': 'Configuracion',
'notes.debateSubagentsTitle': 'Perspectivas',
'notes.debateSubagentHint': 'Cada perspectiva analiza la nota desde un angulo diferente.',
'notes.debateNewConversation': 'Nueva conversacion',
'notes.debateSessionArchived': 'Conversacion archivada. Se inicio una nueva sesion.',
```

### Modified keys

```javascript
// English
'notes.debateTitle': 'AI Assistant',           // was 'Debate Society'
'notes.debateExpand': 'Open assistant',         // was 'Open AI panel'
'notes.debateCollapse': 'Close assistant',      // was 'Collapse AI panel'
'notes.debatePlay': 'Auto',                     // was 'Start auto debate'
'notes.debatePause': 'Pause',                   // was 'Pause auto debate'
'notes.debateRun': 'Run',                       // was 'Run now'
'notes.debateRounds': 'Debate rounds',          // was 'Rounds'
'notes.debateInterval': 'Interval (sec)',        // was 'Every (s)'
'notes.debateCritical': 'Critical mode',         // was 'Critical'
'notes.debateAddSubagent': 'Add perspective',    // was 'Add subagent'
'notes.debatePromptPlaceholder': 'Write an instruction...', // was 'Instruction for this run (optional)...'
'notes.debateReplace': 'Replace',               // was 'Replace selection'
'notes.debateAppend': 'Append to end',           // was 'Append'
'notes.debateUndoAction': 'Undo',               // was 'Undo edit'
'notes.debateCurated': 'Final result',           // was 'Curated result'
'notes.debateNewChat': 'New conversation',       // was 'New chat'
'notes.debateRotated': 'Conversation archived. A new session has started.', // was 'Debate chat was compacted...'
'notes.debateNothingToApply': 'Run the assistant first to get a suggestion.', // was 'There is no AI output...'
'notes.debateApplied': 'Applied to editor.',     // was 'AI output applied to note.'
'notes.debateRunFailed': 'Analysis failed. Try again.', // was 'Debate execution failed.'
'notes.debateNoEditor': 'Wait for the editor to load.', // was 'Editor is not ready yet.'
'notes.debateNeedOpenai': 'OpenAI is not connected. Go to Settings to add your API key.',
'notes.debateNeedClaude': 'Claude is not connected. Go to Settings to add your API key.',
'notes.debateNeedBoth': 'Combined mode requires both providers connected.',

// Spanish
'notes.debateTitle': 'Asistente IA',
'notes.debateExpand': 'Abrir asistente',
'notes.debateCollapse': 'Cerrar asistente',
'notes.debatePlay': 'Auto',
'notes.debatePause': 'Pausar',
'notes.debateRun': 'Ejecutar',
'notes.debateRounds': 'Rondas de debate',
'notes.debateInterval': 'Intervalo (seg)',
'notes.debateCritical': 'Modo critico',
'notes.debateAddSubagent': 'Agregar perspectiva',
'notes.debatePromptPlaceholder': 'Escribe una instruccion...',
'notes.debateReplace': 'Reemplazar',
'notes.debateAppend': 'Anexar al final',
'notes.debateUndoAction': 'Deshacer',
'notes.debateCurated': 'Resultado final',
'notes.debateNewChat': 'Nueva conversacion',
'notes.debateRotated': 'Conversacion archivada. Se inicio una nueva sesion.',
'notes.debateNothingToApply': 'Ejecuta el asistente primero para obtener una sugerencia.',
'notes.debateApplied': 'Aplicado al editor.',
'notes.debateRunFailed': 'El analisis fallo. Intenta de nuevo.',
'notes.debateNoEditor': 'Espera a que el editor cargue.',
'notes.debateNeedOpenai': 'OpenAI no esta conectado. Ve a Configuracion para agregar tu API key.',
'notes.debateNeedClaude': 'Claude no esta conectado. Ve a Configuracion para agregar tu API key.',
'notes.debateNeedBoth': 'El modo combinado necesita ambos proveedores conectados.',
```

### Removed keys (functionality absorbed by layout)

```
'notes.debateWriteHint'    -- Replaced by context badge
'notes.debateApplyHint'    -- Replaced by inline apply actions on curated card
'notes.debateShowConfig'   -- Replaced by gear icon button
'notes.debateHideConfig'   -- Replaced by X close button on settings sheet
'notes.debateChatLabel'    -- Replaced by header dropdown
```

---

## 12. VISUAL REFERENCE COMPARISON

### Current layout (flat, confusing)

```
[toggle] [title "Sociedad que Debate"]
-------------------------------------
"1) Escribe una instruccion..."       <-- Hint text nobody reads
[textarea 3 rows]
[Run now] [Play/Pause] OpenAI+Claude  <-- Too much in one row
-------------------------------------
Chat [dropdown selector] [New chat]   <-- Why is this here?
-------------------------------------
  msg 1                               <-- Messages blend into everything
  msg 2
  msg 3
-------------------------------------
"2) Revisa la respuesta..."           <-- Another hint nobody reads
[Insert] [Replace]                    <-- Always visible, often irrelevant
[Append] [Undo]
-------------------------------------
"3) Mostrar configuracion avanzada"   <-- Numbered steps are patronizing
  (collapsed config)
```

### Redesigned layout (chat-centric, clear)

```
[<] Asistente IA  [GPT+Claude] [cog][+]   <-- Clean header, everything named
================================================

  Empty state / Messages / Curated card    <-- ONE scrollable zone

  .======= RESULTADO FINAL ==============.
  | Clear, elevated card with the answer ||
  | [insert] [replace] [append] [undo]  ||
  '======================================='

================================================
Seleccion (240 chars)                      <-- Context at a glance
[Write an instruction...]                  <-- Input where chat users expect it
[Ejecutar]  [Auto]  cada 30s               <-- Actions on the input
```

The redesigned version reduces cognitive zones from 7 to 3, moves the input to the bottom (matching every modern chat interface), and makes the curated result the visual focus of the conversation.

---

*End of specification.*
