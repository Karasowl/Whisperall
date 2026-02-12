# WhisperAll Widget Requirements (User Source of Truth)

Updated: 2026-02-12
Owner: codex-agent

## Core behavior

1. The widget is integrated with the desktop app (not a separate app).
2. On app startup, the widget should open automatically in its transparent compact bar state.
3. The widget must use app settings and share app configuration/state where applicable.
4. Widget actions should feed app history; widget flows should not auto-save to Notes.
5. Animations/transitions must be smooth and professional (no abrupt jumps).

## Positioning and movement

1. Dragging must be easy and stable.
2. Dragged position must persist across app restarts.
3. Settings must allow resetting to default position.
4. Avoid forced snap behavior across multi-monitor setups (can place widget in wrong monitor/zone).
5. Positioning should stay freeform after drag; user can always move it again without friction.

## Dictation module

1. Dictation in widget uses microphone input (not system audio).
2. Include a prompt dropdown:
   - default (no prompt)
   - custom prompts created in Notes
3. After dictation/editing result is ready, auto-paste into the currently focused app cursor location.
4. Widget dictation must not auto-save to Notes.
5. App dictation flow should also avoid automatic Note creation.

## Reader module

1. Reader speed control cycles in this order:
   - 1x -> 1.5x -> 2x -> 3x -> 4x -> 1x
2. Reader includes playback position slider.
3. Reader widget flow must not auto-save to Notes.

## Subtitles module

1. Real-time subtitles overlay from system audio capture (Deepgram streaming).
2. Single translation toggle button in subtitles mode.
3. No source/target language selector in subtitles widget.
4. Translation target language always uses the app setting language.

## Translator module

1. Overlay translator flow with source language auto-detection.
2. User selects target language only.
3. Clipboard-oriented quick translation flow should be supported.
