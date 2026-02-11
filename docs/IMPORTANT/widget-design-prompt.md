# Design Brief: WhisperAll Floating Overlay Widget

## What You're Designing

A **floating overlay widget** for a desktop app (Electron) that sits on top of all windows. Think of it like the Wispr Flow dictation bar, but with **4 modules** instead of 1. It's the quick-access panel for an all-in-one voice AI app called **WhisperAll**.

The widget floats above everything (always-on-top), has a transparent frameless window, and must feel **premium, minimal, and non-intrusive** — like something Apple or Linear would ship.

---

## Technical Constraints (READ THESE FIRST)

- **Dark-only** (no light mode). Background: near-black (#0a0a0a to #111). Text: white with varying opacity.
- **Transparent Electron window** — the widget renders inside a transparent frameless BrowserWindow. Everything outside the visible elements is fully transparent (clicks pass through to apps below).
- **Three window sizes** — the widget uses exactly 3 Electron window sizes. Transitions between states that share a window size are smooth (just CSS). Transitions that change window size cause a brief reflow.
  - **Base**: 280×100px — used for pill, hover, and dictating states (NO resize between them)
  - **Expanded**: 260×148px — used for the full module panel
  - **Subtitles**: 600×56px — used for subtitle text bar
- **Content anchored to bottom-center** of the base 280×100 frame. The pill/hover/dictating content grows upward from the bottom.
- **Font**: Inter (weights 300–900). **Icons**: Material Symbols Outlined (variable font with FILL 0→1 axis).
- **No React Router** — it's a single component with conditional rendering based on state.
- **CSS only** — no Tailwind in the overlay. Plain CSS with CSS custom properties.

---

## The 4 Modules

| Module | Icon | Purpose |
|--------|------|---------|
| **Dictate** | `mic` | Voice dictation — record mic → transcribe → paste into active app |
| **Reader** | `volume_up` | Text-to-speech — reads clipboard content aloud (Google WaveNet) |
| **Translator** | `translate` | Translate clipboard text to target language (DeepL) |
| **Subtitles** | `subtitles` | Real-time subtitles overlay for meetings/calls |

---

## The 5 Widget Modes (design each one)

### MODE 1: Pill ("Barrita")
**Window**: Base 280×100 (content at bottom-center)
**What it is**: The idle/resting state. A tiny horizontal bar, barely noticeable.
**Behavior**:
- Always visible when overlay is enabled
- **Click-through** — mouse clicks pass through to apps below
- But mouse hover IS detected (Electron forwards mouse-move events)
- On mouse hover → transitions to Mode 2 (Hover)

**Design requirements**:
- A small rounded pill, ~100px wide, ~5px tall
- Nearly black background (#111)
- Inside: 8 tiny dots/dashes (white, ~55% opacity, 2.5px diameter each)
- Subtle shadow underneath
- On CSS hover: thin white border glow appears (border + shadow transition)
- **Inspiration**: Wispr Flow's idle bar — almost invisible, just enough to know it's there

**ASCII sketch**:
```
                         ┌──────────────────────────┐
                         │                          │  ← 280×100 transparent
                         │                          │
                         │                          │
                         │      ·· ·· ·· ·· ··      │  ← 100×5 pill at bottom
                         └──────────────────────────┘
```

---

### MODE 2: Hover (Module Selector)
**Window**: Base 280×100 (same, no resize)
**What it is**: The user is hovering — show available actions.
**Behavior**:
- Appears when mouse enters the pill
- Disappears when mouse leaves this bar → returns to pill
- **Interactive** — buttons are clickable
- Clicking mic → goes to Mode 3 (Dictating)
- Clicking other icons → goes to Mode 4 (Expanded) with that module
- Clicking expand icon → goes to Mode 4 (Expanded)

**Design requirements**:
- A rounded pill/capsule bar, ~36px tall
- Near-black background (#0e0e0e) with subtle border (white 10% opacity)
- Strong shadow for depth
- Contains 5 icon buttons in a row:
  - **Mic** (blue #3b82f6 — primary action, highlighted)
  - Volume Up (muted white 40% opacity)
  - Translate (muted)
  - Subtitles (muted)
  - Open/Expand (muted)
- Each button: icon only, 18px icon size, 10px border-radius
- Hover state on each button: white text + subtle background
- **Fade-in animation**: opacity 0→1 over 120ms (no scale, no slide)

**ASCII sketch**:
```
                         ┌──────────────────────────┐
                         │                          │
                         │                          │
                         │                          │
                         │  [🎤] [🔊] [🌐] [CC] [⤢] │  ← 36px hover bar
                         └──────────────────────────┘
```

---

### MODE 3: Dictating (Compact Recording View)
**Window**: Base 280×100 (same, no resize)
**What it is**: Active dictation — the user is speaking. This is the Wispr Flow-inspired state.
**Behavior**:
- Shown while recording and while processing (after recording stops)
- When transcription completes → transitions to Mode 4 (Expanded) to show result
- **Two sub-states** based on hotkey mode setting:
  - **Toggle mode** (hands-free): Shows cancel (X) + waveform + stop buttons
  - **Hold mode** (push-to-talk): Shows only the waveform (no buttons needed, releasing key stops)

**Design requirements**:
- Stacked vertically, centered:
  1. **Status label**: pill-shaped, near-black bg, white text
     - Recording: "Dictating with WhisperAll"
     - Processing: "Processing..."
     - ~13px font, 500 weight, 20px border-radius, 7px 20px padding
     - Strong shadow
  2. **Controls row** below the label, 10px gap:
     - **(Toggle mode only)** Cancel button: 30px blue (#3b82f6) circle, white X icon
     - **Waveform**: 10 vertical white bars in a dark pill container
       - Each bar: 3px wide, animates height 4px↔18px with staggered delays
       - Container: 28px tall, #0a0a0a background, 14px border-radius
       - During "processing": bars pulse slower (2s cycle, lower height range, opacity fading)
     - **(Toggle mode, recording only)** Stop button: 30px red (#ef4444) circle, white stop icon
- **Fade-in animation**: opacity 0→1 over 150ms

**ASCII sketch — Toggle mode (hands-free)**:
```
                         ┌──────────────────────────┐
                         │                          │
                         │  ┌──────────────────────┐│
                         │  │Dictating w/ WhisperAll││  ← dark pill label
                         │  └──────────────────────┘│
                         │    (✕)  ║║║║║║║║║║  (●)  │  ← cancel + waveform + stop
                         └──────────────────────────┘
```

**ASCII sketch — Hold mode (push-to-talk)**:
```
                         ┌──────────────────────────┐
                         │                          │
                         │  ┌──────────────────────┐│
                         │  │Dictating w/ WhisperAll││
                         │  └──────────────────────┘│
                         │       ║║║║║║║║║║         │  ← waveform only
                         └──────────────────────────┘
```

---

### MODE 4: Expanded (Full Module Panel)
**Window**: 260×148px (resizes from base)
**What it is**: The full interactive panel showing one module at a time with tab navigation.
**Behavior**:
- Header is **draggable** (user can reposition the widget)
- Tab bar switches between all 4 modules
- Close button (X) → dismisses back to pill and hides overlay
- This is the only mode where the widget has a solid background panel

**Design requirements**:
- Rounded rectangle: 14px border-radius
- Background: dark glass (#161616), 1px border (white 8% opacity)
- Deep shadow + inset highlight at top
- **Header**: flex row, draggable area
  - Left: 4 tab icons (mic, volume_up, translate, subtitles)
    - Active tab: blue icon + blue tinted background
    - Inactive: subtle white 35% opacity, hover shows white + bg
    - Each: 16px icon, 6px padding, 6px border-radius
  - Right: close (X) button
- **Body**: centered content, 10px padding

#### Dictate Module — 3 sub-states in expanded:

**4a. Idle** (no recording active):
- Single blue button: "Dictate" with mic icon
- Pill-shaped, 16px border-radius, 8px 16px padding
- Blue #3b82f6, white text, 12px font, 500 weight

**4b. Done** (transcription result):
- Text preview box: 12px font, dark input bg, rounded, max 52px height with scroll
- Two buttons below:
  - "Paste" (blue primary, with content_paste icon) — pastes text into active app
  - "Again" (ghost/outline button) — resets for new recording

**4c. Error**:
- Red error text (12px, #ef4444)
- "Retry" ghost button

#### Reader Module:
- Single blue button: "Read Clipboard" with volume_up icon
- Same style as dictate idle button

#### Translator Module:
- Blue button: "Translate Clipboard" with translate icon
- Below (when result exists): text preview box showing translated text

#### (Subtitles tab switches to Mode 5 instead)

**ASCII sketch**:
```
┌────────────────────────────────────┐
│ [🎤][🔊][🌐][CC]            [✕]  │  ← header with tabs + close
│──────────────────────────────────  │
│                                    │
│         [ 🎤 Dictate ]             │  ← blue pill button (idle)
│                                    │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ [🎤][🔊][🌐][CC]            [✕]  │
│──────────────────────────────────  │
│ ┌────────────────────────────────┐ │
│ │ Hello, this is the transcribed │ │  ← result text box
│ └────────────────────────────────┘ │
│      [📋 Paste]    [Again]        │  ← action buttons
└────────────────────────────────────┘
```

---

### MODE 5: Subtitles
**Window**: 600×56px (resizes from whatever previous mode was)
**What it is**: Wide horizontal bar showing real-time subtitle text from meetings/calls.
**Behavior**:
- Text updates in real-time as speech is detected
- Close button dismisses back to pill
- Typically shown at bottom of screen

**Design requirements**:
- Wide rounded rectangle: 600×80px (with padding), 12px border-radius
- Background: dark (#141414) or light depending on theme
- Close button: top-right corner, small X icon
- Text: 18px, 500 weight, centered, high contrast
- When no text: italic placeholder "Subtitles will appear here..."

**ASCII sketch**:
```
┌───────────────────────────────────────────────────────────────┐
│                                                           [✕] │
│           The speaker is talking about AI models...           │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## State Transition Map

```
                    mouse enter          click mic
     [PILL] ──────────────────► [HOVER] ──────────► [DICTATING]
       ▲         mouse leave       │                     │
       │      ◄────────────────────│                     │
       │                           │ click other         │ done/error
       │                           │ module              ▼
       │                           └──────────► [EXPANDED]
       │                                             │
       │              close/dismiss                   │
       └──────────────────────────────────────────────┘

     [EXPANDED] ──── subtitles tab ────► [SUBTITLES]
                                              │
       [PILL] ◄───── close ───────────────────┘
```

---

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| Background | #0a0a0a – #111 | Pill, labels, waveform container |
| Surface | #0e0e0e – #161616 | Hover bar, expanded panel |
| Border | rgba(255,255,255, 0.06–0.1) | All borders |
| Primary | #3b82f6 | Active tab, mic button, cancel button, CTA buttons |
| Primary hover | #2563eb / #60a5fa | Button hover states |
| Danger | #ef4444 | Stop button, error text |
| Text | rgba(255,255,255, 0.85–0.95) | Primary text, labels |
| Text muted | rgba(255,255,255, 0.4–0.5) | Secondary text, inactive icons |
| Text subtle | rgba(255,255,255, 0.35) | Inactive tabs |
| Shadow | rgba(0,0,0, 0.4–0.6) | Drop shadows on floating elements |

---

## Animation Guidelines

- **NO scale transforms** — they look cheap in Electron transparent windows
- **Fade only**: opacity 0→1 over 120–150ms ease-out
- **CSS transitions** for hover effects: 120ms on color, background, border, shadow
- **Waveform bars**: each bar bounces height (4px↔18px) over 1.2s ease-in-out, staggered by ~100ms per bar. During "processing" state, slower pulse (2s, 5px↔10px, opacity fading)
- **Pill barrita**: transitions on width/height/shadow/border over 200ms ease

---

## Reference: Wispr Flow (the inspiration)

The UX is directly inspired by **Wispr Flow** (wisprflow.ai). Key things to match:
1. The idle state is a barely-visible bar — it should NOT feel like an app window
2. The dictating state has a clear text label ("Dictating with...") above the waveform
3. Hands-free mode shows cancel + stop buttons flanking the waveform
4. The whole thing feels like a system-level HUD element, not a floating app panel
5. It does NOT replace the system clipboard — dictation results get "pasted" directly

WhisperAll's difference: we have 4 modules (not just dictation), so the hover state shows a module picker. But the **dictating experience itself** should be identical to Wispr Flow's.

---

## Deliverable

Design all 5 modes showing every sub-state:
1. Pill (idle + CSS hover highlight)
2. Hover (module selector bar)
3. Dictating — toggle mode recording, toggle mode processing, hold mode recording
4. Expanded — dictate idle, dictate done, dictate error, reader, translator, translator with result
5. Subtitles — with text, with placeholder

All on a dark desktop screenshot background to show how they float over other apps.
Use the exact sizes, colors, and constraints documented above.
