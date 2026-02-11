@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
uvicorn app.main:asgi_app --host 127.0.0.1 --port 8080 --reload
