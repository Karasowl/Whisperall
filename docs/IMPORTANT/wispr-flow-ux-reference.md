# Wispr Flow UX Reference — Target for WhisperAll

> Screenshots provided by user on 2026-02-07. This documents the UX patterns
> we want to replicate/adapt in WhisperAll's dictation overlay.

## Key Principles (from user observation)

1. **Non-intrusive overlay** — lives at bottom of screen, minimal footprint
2. **Does NOT replace the clipboard** — user can still copy/paste normally
3. **Hands-free mode** — can dictate without holding the shortcut key down
4. **Contextual states** — the overlay changes appearance based on state
5. **Clean, polished settings** — organized by category with toggle switches

---

## Overlay States (4 states observed)

### 1. Idle / No Hover — "Barrita"
- **Appearance**: Tiny pill/bar at bottom-center of screen
- **Size**: ~120px wide, ~8px tall
- **Style**: White dots/dashes inside a black rounded pill, very subtle
- **Behavior**: Always visible (if "Show Flow bar at all times" is on), unobtrusive
- **Key insight**: Almost invisible — doesn't distract from work

### 2. Hover / Ready
- **Appearance**: Slightly larger pill with a thin white outline/border
- **Size**: ~100px wide, ~24px tall
- **Style**: Dark pill with white/light border, empty inside
- **Behavior**: Shows on mouse hover or when approaching the bar
- **Key insight**: Invites interaction without being aggressive

### 3. Active Dictation (basic)
- **Appearance**: "Dictating with Wispr Flow" label + waveform animation
- **Layout**: Label on top (dark pill with white text), waveform below (white bars in black pill)
- **Size**: Label ~250px wide, waveform ~80px wide
- **Style**: Stacked vertically, centered at bottom
- **Key insight**: Clear status feedback, the waveform animates with voice amplitude

### 4. Active Dictation (hands-free / with controls)
- **Appearance**: Same label + waveform, BUT with cancel (X) and stop (red circle) buttons
- **Layout**: Label on top, controls row below: [X cancel] [waveform] [red stop]
- **Size**: Controls row ~150px wide
- **Style**: X button is blue circle, stop is red circle, waveform in center
- **Key insight**: Hands-free mode shows controls because user isn't holding a key

---

## Settings Page

### Structure
- Left sidebar with icon + label for each category
- Two groups: SETTINGS (General, System, Vibe coding, Experimental) and ACCOUNT (Account, Team, Plans and Billing, Data and Privacy)
- Right panel shows settings for selected category
- Settings organized in sections (App settings, Sound, Extras)

### Toggle Style
- Green pill toggles (iOS-style) for boolean settings
- Section headers in bold, items indented below
- Separator lines between items
- Clean white background, no clutter

### Settings Observed (System page)
- **App settings**: Launch at login, Show Flow bar at all times, Show app in dock
- **Sound**: Dictation sound effects, Mute music while dictating
- **Extras**: (cut off in screenshot)

---

## How This Maps to WhisperAll

| Wispr Flow | WhisperAll Equivalent | Notes |
|---|---|---|
| Dictation overlay bar | Our floating widget | We already have a widget, needs state refinement |
| "Dictating with..." label | Status indicator in widget | Add clear state labels |
| Waveform animation | Audio level visualization | Need to pipe mic levels to overlay |
| Hands-free mode | Toggle-to-dictate (vs hold) | Add to settings + hotkey module |
| Settings categories | SettingsModal sections | Already have modal, needs polish |
| "Show bar at all times" | Widget visibility setting | Already have overlay toggle |
| Cancel/Stop controls | Widget action buttons | Already have in widget modules |
| Doesn't replace clipboard | Use insertText/execCommand | Our dictation already does this via paste simulation |

## Adaptation Notes

WhisperAll does MORE than Wispr Flow (7 features vs 1), so our overlay needs:
- Multi-module support (dictate, reader, translator, subtitles) — ALREADY DONE
- But the **idle/hover/active states** pattern is what we're missing
- The **minimal barrita** when not in use is the key UX improvement
- The **hands-free toggle** mode for dictation is important for accessibility

## Priority Changes

1. **Overlay idle state**: Collapse widget to a tiny bar when not active
2. **Hover expand**: Show module switcher on hover
3. **Active state**: Show clear status + waveform + controls per module
4. **Hands-free dictation**: Toggle mode in addition to hold-to-talk
5. **Settings polish**: Match the clean toggle-based layout
6. **Audio waveform**: Pipe mic amplitude to overlay for visual feedback
