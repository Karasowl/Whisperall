# Installer Plan (Goal Memory)

Goal: ship normal installers for Windows/Mac/Linux/Android. Users should not see "venvs"; all complexity stays inside packaging.

Current decisions to implement:
1) GPU toggle + autodetect: show GPU as optional device in Settings, default Auto, fall back to CPU if CUDA not available.
2) WhisperX as optional backend: keep main bundle stable with pyannote; launch WhisperX in a separate backend if installed/selected.

Packaging strategy (high level):
- Desktop CPU installer: works everywhere.
- Optional GPU backend bundle for NVIDIA (downloadable or separate installer).
- Optional WhisperX bundle (separate backend) to avoid numpy conflicts with pyannote.
