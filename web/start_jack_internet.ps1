param([switch]$StayAlive)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bridgeRoot = Join-Path $projectRoot 'bridge'
$toolPath = Join-Path $bridgeRoot 'tools\cloudflared.exe'
$runStatePath = Join-Path $bridgeRoot 'run-state.json'
$publicConfigPath = Join-Path $projectRoot 'public\bridge-config.json'
$bridgeUrl = 'http://127.0.0.1:8765'

function Stop-PreviousJackProcess([int]$processId, [string]$expectedText) {
    if ($processId -le 0) { return }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -and $process.CommandLine.Contains($expectedText)) {
        Stop-Process -Id $processId -ErrorAction SilentlyContinue
    }
}

while ($true) {
$bridge = $null
$tunnel = $null
try {
if (Test-Path -LiteralPath $runStatePath) {
    try {
        $old = Get-Content -LiteralPath $runStatePath -Raw | ConvertFrom-Json
        Stop-PreviousJackProcess ([int]$old.tunnelPid) 'cloudflared.exe'
        Stop-PreviousJackProcess ([int]$old.bridgePid) 'server.mjs'
        Start-Sleep -Seconds 2
    } catch { Write-Warning 'The earlier Jack process state could not be read.' }
}

if (-not (Test-Path -LiteralPath $toolPath)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $toolPath) -Force | Out-Null
    Write-Host 'Downloading the official Cloudflare Tunnel program...'
    Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $toolPath
}

$bridgeOut = Join-Path $bridgeRoot 'bridge-out.log'
$bridgeErr = Join-Path $bridgeRoot 'bridge-err.log'
$bridge = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('server.mjs') -WorkingDirectory $bridgeRoot -WindowStyle Hidden -RedirectStandardOutput $bridgeOut -RedirectStandardError $bridgeErr -PassThru
Start-Sleep -Seconds 2
try {
    $health = Invoke-RestMethod "$bridgeUrl/health" -TimeoutSec 5
    if (-not $health.ok) { throw 'Jack bridge did not start.' }
} catch {
    throw "Jack bridge failed to start. Read $bridgeErr"
}

$tunnelOut = Join-Path $bridgeRoot 'tunnel-out.log'
$tunnelErr = Join-Path $bridgeRoot 'tunnel-err.log'
$tunnel = Start-Process -FilePath $toolPath -ArgumentList @('tunnel','--url',$bridgeUrl,'--protocol','http2','--no-autoupdate') -WorkingDirectory $bridgeRoot -WindowStyle Hidden -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr -PassThru
$tunnelUrl = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    $logs = ''
    if (Test-Path -LiteralPath $tunnelOut) { $logs += Get-Content -LiteralPath $tunnelOut -Raw }
    if (Test-Path -LiteralPath $tunnelErr) { $logs += Get-Content -LiteralPath $tunnelErr -Raw }
    $match = [regex]::Match($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($match.Success) { $tunnelUrl = $match.Value; break }
    if ($tunnel.HasExited) { break }
}
if (-not $tunnelUrl) { throw "Cloudflare did not provide a temporary address. Read $tunnelErr" }

Write-Host 'Checking that the new laptop AI address is reachable from the internet...'
$tunnelReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($bridge.HasExited -or $tunnel.HasExited) { break }
    try {
        $remoteHealth = Invoke-RestMethod "$tunnelUrl/health" -TimeoutSec 5
        if ($remoteHealth.ok) { $tunnelReady = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}
if (-not $tunnelReady) {
    Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue
    Stop-Process -Id $bridge.Id -ErrorAction SilentlyContinue
    throw "The new tunnel address never reached Jack. Check the internet connection and $tunnelErr, then run the launcher again."
}

@{apiBase = $tunnelUrl} | ConvertTo-Json -Compress | Set-Content -LiteralPath $publicConfigPath -Encoding utf8
@{bridgePid = $bridge.Id; tunnelPid = $tunnel.Id; tunnelUrl = $tunnelUrl} | ConvertTo-Json -Compress | Set-Content -LiteralPath $runStatePath -Encoding utf8

Write-Host 'Publishing the Jack website with the new secure laptop address...'
Push-Location $projectRoot
try {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $deployOutput = & firebase.cmd deploy --only hosting --project jack-speaksmart-ai-2026 2>&1 | Out-String
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    Write-Host $deployOutput
    if ($deployOutput -notmatch 'Deploy complete!') { throw 'Firebase deployment failed.' }
} finally { Pop-Location }

Write-Host ''
Write-Host 'Jack is online while this laptop, Ollama, the bridge, and Cloudflare Tunnel stay running.'
Write-Host 'Website: https://jack-speaksmart-ai-2026.web.app/'
Write-Host "Laptop tunnel: $tunnelUrl"
Write-Host 'Sign in with Google on the website, then use Conversation, Tamil to English, Grammar chat, or Quick quiz.'
if ($StayAlive) {
    Write-Host 'Keep this window open while using laptop AI. Jack will reconnect if the tunnel drops.'
    $failedHealthChecks = 0
    while ($true) {
        Start-Sleep -Seconds 15
        if ($bridge.HasExited -or $tunnel.HasExited) {
            throw 'Jack bridge or tunnel stopped.'
        }
        try {
            $remoteHealth = Invoke-RestMethod "$tunnelUrl/health" -TimeoutSec 8
            if ($remoteHealth.ok) {
                $failedHealthChecks = 0
                continue
            }
        } catch { }
        $failedHealthChecks++
        Write-Warning "Jack tunnel health check failed ($failedHealthChecks/8)."
        if ($failedHealthChecks -ge 8) {
            throw 'Jack tunnel has stopped answering from the internet.'
        }
    }
}
break
} catch {
    if (-not $StayAlive) { throw }
    Write-Warning "Jack is reconnecting: $_"
    if ($tunnel) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue }
    if ($bridge) { Stop-Process -Id $bridge.Id -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 15
}
}
