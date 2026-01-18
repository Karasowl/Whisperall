# Commercialization Compliance Checklist

This checklist is based on the repository contents and model references as of this file generation. It is not legal advice.

## Repository License

- [ ] MIT license retained in distributions (include `LICENSE` and preserve copyright notice).

## Copyleft Risk Review

- [ ] Remove or isolate `pykakasi` (GPL-3.0-or-later) if you want proprietary distribution; verify no runtime usage.
- [ ] Review `pynput` (LGPLv3) usage and compliance if distributed (dynamic linking, license text, relinking rights).

## Direct Dependency Notices

- [ ] Ship `THIRD_PARTY_NOTICES.md` with license texts for direct deps.
- [ ] Verify transitive dependencies separately (use a full dependency scanner).
- [ ] Confirmed direct deps in this repo:
  - [ ] `argostranslate` (MIT)
  - [ ] `pynput` (LGPLv3)
  - [ ] `pyperclip` (BSD)
  - [ ] `whisperx` (BSD-2-Clause)

## Model Weights and Terms (Hugging Face)

- [ ] Pyannote models (gated; require terms acceptance per HF):
  - [ ] `pyannote/speaker-diarization-3.1` (license: MIT, gated=auto)
  - [ ] `pyannote/segmentation-3.0` (license: MIT, gated=auto)
  - [ ] `pyannote/embedding` (license: MIT, gated=auto)
  - [ ] `pyannote/speaker-diarization-community-1` (license: CC-BY-4.0, gated=auto; attribution required)
- [ ] Faster-Whisper models (Systran) used in `model_manager.py` are MIT.
- [ ] ResembleAI/Chatterbox and Chatterbox-Turbo models report MIT license.
- [ ] Preserve any required attributions for model weights in documentation or UI.

## Distribution Packaging

- [ ] Ensure runtime data caches are outside the repo (AppData/OS temp).
- [ ] Bundle license files with installers (Windows/macOS/Linux).
- [ ] Ensure UI shows required attributions (if needed for model terms).

## Documentation

- [ ] Add a short commercial use notice to README and/or About dialog.
- [ ] Document how to accept gated model terms and provide HF token.

