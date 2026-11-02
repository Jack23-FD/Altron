@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Setting up SpeakSmart for the first time...
  python -m venv .venv
  if errorlevel 1 goto setup_failed
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 goto setup_failed
)

echo Opening SpeakSmart AI...
".venv\Scripts\python.exe" -m streamlit run app.py
if errorlevel 1 goto setup_failed
exit /b 0

:setup_failed
echo.
echo SpeakSmart could not start. Check that Python is installed, then see README.md.
pause
exit /b 1
