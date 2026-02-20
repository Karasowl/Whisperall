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

REM Pick a Vite port that can actually bind on this Windows host.
if defined WHISPERALL_VITE_PORT (
    set "VITE_PORT=%WHISPERALL_VITE_PORT%"
) else (
    for /f %%P in ('powershell -NoProfile -Command "$ports=55173..55250; foreach($p in $ports){ try { $l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$p); $l.Start(); $l.Stop(); Write-Output $p; break } catch {} }"') do set "VITE_PORT=%%P"
)
if "%VITE_PORT%"=="" (
    echo ERROR: Could not find a free Vite port.
    pause
    exit /b 1
)
echo Using Vite port %VITE_PORT%
echo.

REM Kill any leftover processes on our ports
powershell -Command "Get-NetTCPConnection -LocalPort %VITE_PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul
powershell -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul

REM ── Start API server in background ──
echo Starting API server on http://127.0.0.1:8080 ...
start "WhisperAll-API" /min apps\api\start-api.bat

REM Wait for API to be ready (poll /v1/health, up to 20s)
echo Waiting for API...
powershell -Command "for ($i=0; $i -lt 20; $i++) { Start-Sleep 1; try { $null = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/health' -UseBasicParsing -TimeoutSec 1; Write-Host 'API ready!'; exit 0 } catch {} }; Write-Host 'WARNING: API may not be ready yet (continuing anyway)'; exit 0"
echo.

REM ── Start Vite dev server in background ──
set "DESKTOP_DIR=%~dp0apps\desktop"
set "VITE_PID_FILE=%TEMP%\whisperall-vite.pid"
if exist "%VITE_PID_FILE%" del /q "%VITE_PID_FILE%" >nul 2>nul
set /a VITE_MAX_ATTEMPTS=4
set /a VITE_START_ATTEMPT=0

:START_VITE_RETRY
set /a VITE_START_ATTEMPT=%VITE_START_ATTEMPT%+1
echo Starting Vite dev server (attempt %VITE_START_ATTEMPT%/%VITE_MAX_ATTEMPTS%)...
set "VITE_OUT_LOG=%TEMP%\whisperall-vite-%VITE_PORT%-out.log"
set "VITE_ERR_LOG=%TEMP%\whisperall-vite-%VITE_PORT%-err.log"
if exist "%VITE_OUT_LOG%" del /q "%VITE_OUT_LOG%" >nul 2>nul
if exist "%VITE_ERR_LOG%" del /q "%VITE_ERR_LOG%" >nul 2>nul
powershell -Command "Get-NetTCPConnection -LocalPort %VITE_PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul
powershell -NoProfile -Command "$p = Start-Process -FilePath 'cmd.exe' -WorkingDirectory '%DESKTOP_DIR%' -ArgumentList '/c pnpm exec vite --host 127.0.0.1 --port %VITE_PORT% --strictPort' -WindowStyle Minimized -RedirectStandardOutput '%VITE_OUT_LOG%' -RedirectStandardError '%VITE_ERR_LOG%' -PassThru; Write-Output $p.Id" > "%VITE_PID_FILE%" 2>nul
set "VITE_PID="
for /f %%I in ('type "%VITE_PID_FILE%" 2^>nul') do set "VITE_PID=%%I"

REM Wait for Vite to be ready (poll selected port, up to 60s)
echo Waiting for Vite on http://127.0.0.1:%VITE_PORT% ...
powershell -NoProfile -Command "$uri='http://127.0.0.1:%VITE_PORT%'; for ($i=0; $i -lt 60; $i++) { Start-Sleep 1; try { $null = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 2; Write-Host 'Vite ready!'; exit 0 } catch {} }; Write-Host 'ERROR: Vite did not start after 60 seconds.'; exit 1"
if %errorlevel% neq 0 goto VITE_FAILED
goto VITE_READY

:VITE_FAILED
echo.
echo -------- Vite stdout log --------
if exist "%VITE_OUT_LOG%" (
    type "%VITE_OUT_LOG%"
) else (
    echo (no vite stdout log found at %VITE_OUT_LOG%^)
)
echo -------- Vite stderr log --------
if exist "%VITE_ERR_LOG%" (
    type "%VITE_ERR_LOG%"
) else (
    echo (no vite stderr log found at %VITE_ERR_LOG%^)
)
echo ----------------------------------
echo.
echo -------- Vite process diagnostics --------
powershell -NoProfile -Command "$items = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*vite*--port %VITE_PORT%*' }; if (-not $items) { Write-Host 'No node/vite process found for this port.' } else { $items | Select-Object ProcessId, CommandLine | Format-List }"
echo ------------------------------------------

if not "%VITE_PID%"=="" taskkill /PID %VITE_PID% /T /F >nul 2>nul
powershell -Command "Get-NetTCPConnection -LocalPort %VITE_PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul

if %VITE_START_ATTEMPT% GEQ %VITE_MAX_ATTEMPTS% (
    echo ERROR: Vite failed after %VITE_MAX_ATTEMPTS% attempts.
    pause
    exit /b 1
)

for /f %%P in ('powershell -NoProfile -Command "$all=55173..55250; $ordered=@($all | Where-Object {$_ -gt %VITE_PORT%}) + @($all | Where-Object {$_ -le %VITE_PORT%}); foreach($p in $ordered){ try { $l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$p); $l.Start(); $l.Stop(); Write-Output $p; break } catch {} }"') do set "VITE_PORT=%%P"
if "%VITE_PORT%"=="" (
    echo ERROR: Could not find another free Vite port.
    pause
    exit /b 1
)
echo Retrying with Vite port %VITE_PORT% ...
echo.
goto START_VITE_RETRY

:VITE_READY
echo.

REM ── Build Electron TypeScript ──
echo Building Electron...
cd /d "%~dp0apps\desktop"
call pnpm build:electron
echo.

REM ── Launch Electron ──
echo Starting Electron...
set VITE_DEV_SERVER_URL=http://127.0.0.1:%VITE_PORT%
set ELECTRON_RUN_AS_NODE=
call pnpm electron:dev -- %VITE_PORT%

REM ── Cleanup: kill background servers when Electron closes ──
echo.
echo Shutting down...
taskkill /FI "WindowTitle eq WhisperAll-Vite*" /F >nul 2>nul
taskkill /FI "WindowTitle eq WhisperAll-API*" /F >nul 2>nul
if not "%VITE_PID%"=="" taskkill /PID %VITE_PID% /T /F >nul 2>nul
powershell -Command "Get-NetTCPConnection -LocalPort %VITE_PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul
powershell -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul
echo Done.
