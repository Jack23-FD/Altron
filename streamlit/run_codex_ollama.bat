@echo off
cd /d "%~dp0"
echo Starting Codex CLI with local Ollama in read-only mode...
codex --oss --local-provider ollama -m qwen3:1.7b -s read-only -a on-request
if errorlevel 1 (
  echo Codex could not start. Check that Ollama is running and qwen3:1.7b is installed.
  pause
)
