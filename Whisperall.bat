@echo off
title WhisperAll v2
cd /d "%~dp0"

echo ============================================
echo   WhisperAll v2 - Starting...
echo ============================================
echo.

REM Check pnpm
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: pnpm not found. Install with: npm install -g pnpm
    pause
    exit /b 1
)

REM Install deps if needed
if not exist "node_modules" (
    echo Installing root dependencies...
    pnpm install
)
if not exist "apps\desktop\node_modules" (
    echo Installing desktop dependencies...
    pnpm install
)

REM Kill any leftover Vite/Electron on our ports
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%p /F >nul 2>nul
)

REM Start Vite dev server in background
echo Starting Vite dev server...
start "WhisperAll-Vite" /min cmd /c "cd /d %~dp0apps\desktop && pnpm dev"

REM Wait for Vite to be ready (poll localhost:5173)
echo Waiting for Vite on http://localhost:5173 ...
set /a attempts=0
:wait_vite
set /a attempts+=1
if %attempts% gtr 30 (
    echo ERROR: Vite did not start after 30 seconds.
    pause
    exit /b 1
)
timeout /t 1 /nobreak >nul
powershell -Command "try { (Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 1).StatusCode } catch { exit 1 }" >nul 2>nul
if %errorlevel% neq 0 goto wait_vite
echo Vite ready!
echo.

REM Launch Electron
echo Starting Electron...
cd /d "%~dp0apps\desktop"
set VITE_DEV_SERVER_URL=http://localhost:5173
pnpm electron:dev

REM When Electron closes, kill the Vite server
echo.
echo Shutting down Vite...
taskkill /FI "WindowTitle eq WhisperAll-Vite*" /F >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%p /F >nul 2>nul
)
echo Done.
