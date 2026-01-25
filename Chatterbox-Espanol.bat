@echo off
cd /d "%~dp0"
call venv\Scripts\activate
python multilingual_app.py
pause
