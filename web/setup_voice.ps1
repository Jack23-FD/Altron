$ErrorActionPreference = 'Stop'
$speechRoot = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'bridge\speech'
$python = Join-Path $speechRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    Write-Host 'Creating the local voice environment...'
    python -m venv (Join-Path $speechRoot '.venv')
}
Write-Host 'Installing the free local Whisper speech model tools...'
& $python -m pip install -r (Join-Path $speechRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Voice package installation failed.' }
Write-Host 'Downloading the multilingual English and Tamil speech model for offline use...'
& $python (Join-Path $speechRoot 'transcribe.py') --warmup
if ($LASTEXITCODE -ne 0) { throw 'Voice model setup failed.' }
Write-Host 'Voice setup is ready. Start Jack with start_jack_internet.bat.'
