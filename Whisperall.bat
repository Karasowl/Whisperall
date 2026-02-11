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

REM Check python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: python not found. Install Python 3.11+
    pause
    exit /b 1
)

REM Install JS deps if needed
if not exist "node_modules" (
    echo Installing root dependencies...
    call pnpm install
)
if not exist "apps\desktop\node_modules" (
    echo Installing desktop dependencies...
    call pnpm install
)

REM Create Python venv if needed
if not exist "apps\api\venv" (
    echo Creating Python venv...
    python -m venv "apps\api\venv"
)

REM Install Python deps
echo Installing API dependencies...
call "apps\api\venv\Scripts\activate.bat"
pip install -q -r "apps\api\requirements.txt"
call deactivate

REM Check API .env exists
if not exist "apps\api\.env" (
    echo.
    echo ============================================
    echo   ERROR: apps\api\.env not found!
    echo   Copy apps\api\.env.example to apps\api\.env
    echo   and fill in your API keys.
    echo ============================================
    pause
    exit /b 1
)

REM Kill any leftover processes on our ports
powershell -Command "Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul
powershell -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul

REM ── Start API server in background ──
echo Starting API server on http://127.0.0.1:8080 ...
start "WhisperAll-API" /min apps\api\start-api.bat

REM Wait for API to be ready (poll /v1/health, up to 20s)
echo Waiting for API...
powershell -Command "for ($i=0; $i -lt 20; $i++) { Start-Sleep 1; try { $null = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/health' -UseBasicParsing -TimeoutSec 1; Write-Host 'API ready!'; exit 0 } catch {} }; Write-Host 'WARNING: API may not be ready yet (continuing anyway)'; exit 0"
echo.

REM ── Start Vite dev server in background ──
echo Starting Vite dev server...
start "WhisperAll-Vite" /min /d "%~dp0apps\desktop" pnpm dev

REM Wait for Vite to be ready (poll localhost:5173, up to 30s)
echo Waiting for Vite on http://127.0.0.1:5173 ...
powershell -Command "for ($i=0; $i -lt 30; $i++) { Start-Sleep 1; try { $null = Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 1; Write-Host 'Vite ready!'; exit 0 } catch {} }; Write-Host 'ERROR: Vite did not start after 30 seconds.'; exit 1"
if %errorlevel% neq 0 (
    pause
    exit /b 1
)
echo.

REM ── Build Electron TypeScript ──
echo Building Electron...
cd /d "%~dp0apps\desktop"
call pnpm build:electron
echo.

REM ── Launch Electron ──
echo Starting Electron...
set VITE_DEV_SERVER_URL=http://127.0.0.1:5173
set ELECTRON_RUN_AS_NODE=
call pnpm electron:dev

REM ── Cleanup: kill background servers when Electron closes ──
echo.
echo Shutting down...
taskkill /FI "WindowTitle eq WhisperAll-Vite*" /F >nul 2>nul
taskkill /FI "WindowTitle eq WhisperAll-API*" /F >nul 2>nul
powershell -Command "Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul
powershell -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul
echo Done.
