@echo off
cd /d "%~dp0"
call venv\Scripts\activate
python gradio_tts_app.py
pause
