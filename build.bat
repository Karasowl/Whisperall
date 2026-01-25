@echo off
title Whisperall Build Script
echo.
echo ========================================
echo   Building Whisperall
echo ========================================
echo.

cd /d "%~dp0"

:: Step 1: Build frontend
echo [1/3] Building frontend...
cd ui\frontend
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b 1
)
cd ..\..

:: Step 2: Install Electron dependencies
echo.
echo [2/3] Installing Electron dependencies...
cd electron
call npm install
if errorlevel 1 (
    echo [ERROR] Electron install failed!
    pause
    exit /b 1
)

:: Step 3: Copy frontend to electron
echo.
echo [3/3] Copying frontend to Electron...
if exist frontend rmdir /s /q frontend
mkdir frontend
xcopy /s /e /q ..\ui\frontend\out\* frontend\

echo.
echo ========================================
echo   Build complete!
echo.
echo   To run in dev mode:
echo     cd electron ^&^& npm start
echo.
echo   To package as .exe:
echo     cd electron ^&^& npm run build:win
echo ========================================
echo.
pause
