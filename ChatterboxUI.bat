@echo off
title Whisperall
cd /d "%~dp0"

set VENV_PY=venv\Scripts\python.exe
set WHISPERALL_BACKEND_PORT=8080
set BACKEND_PORT=%WHISPERALL_BACKEND_PORT%
set NEXT_PUBLIC_API_URL=http://localhost:%WHISPERALL_BACKEND_PORT%

if not exist "%VENV_PY%" (
  echo Creating Python venv...
  python -m venv venv
  if errorlevel 1 (
    echo [ERROR] Failed to create venv. Make sure Python is installed.
    pause
    exit /b 1
  )
)

echo Installing backend dependencies...
call "%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 (
  echo [ERROR] Pip upgrade failed.
  pause
  exit /b 1
)

REM Install base dependencies first (will install CPU torch)
call "%VENV_PY%" -m pip install -e ".[ui]"
if errorlevel 1 (
  echo [ERROR] Backend dependency install failed.
  pause
  exit /b 1
)

REM Now detect GPU and upgrade to CUDA PyTorch if available
echo Detecting GPU...
set HAS_NVIDIA_GPU=0
nvidia-smi >nul 2>&1
if %errorlevel%==0 (
  echo [GPU] NVIDIA GPU detected!
  set HAS_NVIDIA_GPU=1
) else (
  echo [GPU] No NVIDIA GPU detected, using CPU version.
  goto :skip_cuda_install
)

REM Check if CUDA PyTorch is already working
"%VENV_PY%" -c "import torch; import sys; sys.exit(0 if torch.cuda.is_available() else 1)"
if %errorlevel%==0 (
  echo [PyTorch] CUDA already working.
  goto :skip_cuda_install
)

REM Install CUDA version of PyTorch (overwriting CPU version)
echo [PyTorch] Installing CUDA version...
"%VENV_PY%" -m pip install --force-reinstall --no-deps torch==2.8.0+cu126 torchvision==0.23.0+cu126 torchaudio==2.8.0+cu126 --index-url https://download.pytorch.org/whl/cu126
if errorlevel 1 (
  echo [WARNING] CUDA PyTorch install failed. Using CPU version.
)

:skip_cuda_install

if not exist ui\frontend\node_modules (
  echo Installing frontend dependencies...
  cd ui\frontend
  call npm install
  if errorlevel 1 (
    echo [ERROR] Frontend npm install failed.
    pause
    exit /b 1
  )
  cd ..\..
)

if not exist electron\node_modules (
  echo Installing Electron dependencies...
  cd electron
  call npm install
  if errorlevel 1 (
    echo [ERROR] Electron npm install failed.
    pause
    exit /b 1
  )
  cd ..
)

set ELECTRON_RUN_AS_NODE=

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set BUILD_TAG=%%i
set NEXT_PUBLIC_APP_VERSION=%BUILD_TAG%
set NEXT_PUBLIC_BUILD_TIME=%BUILD_TAG%
set WHISPERALL_DISABLE_TORCH_COMPILE=1

echo Cleaning old frontend export...
if exist ui\frontend\out rmdir /s /q ui\frontend\out
if exist electron\frontend rmdir /s /q electron\frontend

echo Building frontend...
cd ui\frontend
call npm run build
if errorlevel 1 (
  echo [ERROR] Frontend build failed.
  pause
  exit /b 1
)
cd ..\..

echo Copying frontend to Electron...
mkdir electron\frontend
xcopy /s /e /q ui\frontend\out\* electron\frontend\

cd electron
call npm start
