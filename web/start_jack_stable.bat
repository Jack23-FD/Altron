@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_jack_stable.ps1" -StayAlive
if errorlevel 1 pause
