@echo off
setlocal
title Whisperall Web Dev
cd /d "%~dp0"

set BACKEND_PORT=8080
set FRONTEND_PORT=3000
set WHISPERALL_BACKEND_PORT=%BACKEND_PORT%
set NEXT_PUBLIC_API_URL=http://localhost:%BACKEND_PORT%

echo Killing any process on ports %BACKEND_PORT% and %FRONTEND_PORT%...
for %%P in (%BACKEND_PORT% %FRONTEND_PORT%) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    echo Killing PID %%I on port %%P
    taskkill /F /PID %%I >nul 2>&1
  )
)

echo Starting backend...
start "Whisperall Backend" cmd /k "cd /d %~dp0ui\backend && ..\..\venv\Scripts\python.exe main.py"

echo Starting frontend (Next dev)...
start "Whisperall Frontend" cmd /k "cd /d %~dp0ui\frontend && npm run dev"

echo.
echo Frontend: http://localhost:%FRONTEND_PORT%
echo Backend:  http://localhost:%BACKEND_PORT%/api/health
echo.
