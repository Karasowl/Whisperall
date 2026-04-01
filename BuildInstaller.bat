@echo off
setlocal
cd /d "%~dp0"

set "BUNDLE_DIR=%~dp0apps\desktop\backend-bundle"
set "API_DIR=%~dp0apps\api"
set "API_VENV_DIR=%API_DIR%\venv"
set "API_VENV_PY=%API_VENV_DIR%\Scripts\python.exe"
set "SYSTEM_PY="
set "SYSTEM_PY_DIR="

echo ============================================
echo   WhisperAll - Build Windows Installer
echo ============================================
echo.

where pnpm >nul 2>nul
if %errorlevel% neq 0 (
  echo ERROR: pnpm not found in PATH.
  echo Install Node.js + pnpm first, then retry.
  pause
  exit /b 1
)

where python >nul 2>nul
if %errorlevel% neq 0 (
  echo ERROR: python not found in PATH.
  echo Install Python 3.11+ and retry.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing workspace dependencies...
  call pnpm install
  if %errorlevel% neq 0 exit /b %errorlevel%
)

if not exist "apps\desktop\node_modules" (
  echo Linking desktop dependencies...
  call pnpm install
  if %errorlevel% neq 0 exit /b %errorlevel%
)

if not exist "%API_DIR%\.env" (
  echo ERROR: %API_DIR%\.env not found.
  pause
  exit /b 1
)

echo Preparing local backend bundle...
call :ensure_api_venv
if %errorlevel% neq 0 exit /b %errorlevel%

for /f "delims=" %%I in ('python -c "import sys; print(sys.executable)"') do set "SYSTEM_PY=%%I"
if "%SYSTEM_PY%"=="" (
  echo ERROR: Could not resolve system Python executable.
  pause
  exit /b 1
)
for %%I in ("%SYSTEM_PY%") do set "SYSTEM_PY_DIR=%%~dpI"
if not exist "%SYSTEM_PY%" (
  echo ERROR: Resolved Python executable does not exist: %SYSTEM_PY%
  pause
  exit /b 1
)

if exist "%BUNDLE_DIR%" rmdir /s /q "%BUNDLE_DIR%"
mkdir "%BUNDLE_DIR%\python-runtime" >nul 2>nul
mkdir "%BUNDLE_DIR%\site-packages" >nul 2>nul
mkdir "%BUNDLE_DIR%\api\app" >nul 2>nul

call :copy_tree "%SYSTEM_PY_DIR%" "%BUNDLE_DIR%\python-runtime"
if %errorlevel% neq 0 exit /b %errorlevel%
call :copy_tree "%API_VENV_DIR%\Lib\site-packages" "%BUNDLE_DIR%\site-packages"
if %errorlevel% neq 0 exit /b %errorlevel%
call :copy_tree "%API_DIR%\app" "%BUNDLE_DIR%\api\app"
if %errorlevel% neq 0 exit /b %errorlevel%
copy /Y "%API_DIR%\.env" "%BUNDLE_DIR%\api\.env" >nul
if %errorlevel% neq 0 (
  echo ERROR: Could not copy API .env into backend bundle.
  pause
  exit /b 1
)

echo.
echo Building installer...
cd /d "%~dp0apps\desktop"
call pnpm dist:win
if %errorlevel% neq 0 (
  echo.
  echo ERROR: Installer build failed.
  pause
  exit /b %errorlevel%
)

echo.
echo Installer ready in:
echo %~dp0apps\desktop\release
pause
exit /b 0

:ensure_api_venv
echo Rebuilding API venv for packaged backend...
if exist "%API_VENV_DIR%" rmdir /s /q "%API_VENV_DIR%"
python -m venv "%API_VENV_DIR%"
if %errorlevel% neq 0 (
  echo ERROR: Could not create API venv.
  pause
  exit /b 1
)
call "%API_VENV_PY%" -m pip install -q -r "%API_DIR%\requirements.txt"
if %errorlevel% neq 0 (
  echo ERROR: Could not install API dependencies.
  pause
  exit /b 1
)
exit /b 0

:copy_tree
robocopy "%~1" "%~2" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if %errorlevel% gtr 7 (
  echo ERROR: Could not copy %~1 to %~2
  pause
  exit /b %errorlevel%
)
exit /b 0

