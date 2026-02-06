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

REM Kill any leftover Vite on our port
powershell -Command "Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul

REM Start Vite dev server in background
echo Starting Vite dev server...
start "WhisperAll-Vite" /min cmd /c "cd /d %~dp0apps\desktop && pnpm dev"

REM Wait for Vite to be ready (poll localhost:5173, up to 30s)
echo Waiting for Vite on http://localhost:5173 ...
powershell -Command "for ($i=0; $i -lt 30; $i++) { Start-Sleep 1; try { $null = Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 1; Write-Host 'Vite ready!'; exit 0 } catch {} }; Write-Host 'ERROR: Vite did not start after 30 seconds.'; exit 1"
if %errorlevel% neq 0 (
    pause
    exit /b 1
)
echo.

REM Launch Electron (must unset ELECTRON_RUN_AS_NODE - VSCode sets it to 1)
echo Starting Electron...
cd /d "%~dp0apps\desktop"
set VITE_DEV_SERVER_URL=http://localhost:5173
set ELECTRON_RUN_AS_NODE=
pnpm electron:dev

REM When Electron closes, kill the Vite server
echo.
echo Shutting down Vite...
taskkill /FI "WindowTitle eq WhisperAll-Vite*" /F >nul 2>nul
powershell -Command "Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul
echo Done.
