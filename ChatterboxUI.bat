@echo off
title Whisperall
cd /d "%~dp0"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set BUILD_TAG=%%i
set NEXT_PUBLIC_APP_VERSION=%BUILD_TAG%
set NEXT_PUBLIC_BUILD_TIME=%BUILD_TAG%

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
