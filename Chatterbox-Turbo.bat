@echo off
cd /d "%~dp0"
call venv\Scripts\activate
python gradio_tts_turbo_app.py
pause
