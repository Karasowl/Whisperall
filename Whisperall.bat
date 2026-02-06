@echo off
title Whisperall
cd /d "%~dp0"

REM Compatibility shim: keep the original launcher working, but expose a new entrypoint.
REM (We can migrate/rename ChatterboxUI.bat later without breaking existing shortcuts.)
call "%~dp0ChatterboxUI.bat" %*

