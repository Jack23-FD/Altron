param([switch]$StayAlive)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bridgeRoot = Join-Path $projectRoot 'bridge'
$runStatePath = Join-Path $bridgeRoot 'run-state.json'
$publicConfigPath = Join-Path $projectRoot 'public\bridge-config.json'
$localUrl = 'http://127.0.0.1:8765'
$tailscaleCommand = Get-Command tailscale.exe -ErrorAction SilentlyContinue
$tailscalePath = if ($tailscaleCommand) { $tailscaleCommand.Source } else { 'C:\Program Files\Tailscale\tailscale.exe' }

if (-not (Test-Path -LiteralPath $tailscalePath)) {
    throw 'Tailscale is not installed. Install it from https://tailscale.com/download/windows, sign in, then run this launcher again.'
}

$statusText = & $tailscalePath status --json 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw "Tailscale status failed: $statusText" }
$status = $statusText | ConvertFrom-Json
if ($status.BackendState -ne 'Running' -or -not $status.Self.DNSName) {
    throw 'Sign in to Tailscale on this laptop, then run this launcher again.'
}
$dnsName = ([string]$status.Self.DNSName).TrimEnd('.')
if ($dnsName -notmatch '^[a-z0-9-]+\.[a-z0-9.-]+\.ts\.net$') {
    throw "Tailscale returned an unexpected device address: $dnsName"
}
$publicUrl = "https://$dnsName"

function Stop-PreviousJackProcess([int]$processId, [string]$expectedText) {
    if ($processId -le 0) { return }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -and $process.CommandLine.Contains($expectedText)) {
        Stop-Process -Id $processId -ErrorAction SilentlyContinue
    }
}

# Stop only processes recorded by Jack's earlier launcher. Close the old
# Quick Tunnel launcher first so it does not republish a rotating address.
if (Test-Path -LiteralPath $runStatePath) {
    try {
        $old = Get-Content -LiteralPath $runStatePath -Raw | ConvertFrom-Json
        Stop-PreviousJackProcess ([int]$old.tunnelPid) 'cloudflared.exe'
        Stop-PreviousJackProcess ([int]$old.bridgePid) 'server.mjs'
        Start-Sleep -Seconds 2
    } catch { Write-Warning 'Could not stop a previous Jack process; check whether the old launcher is still open.' }
}

$bridgeOut = Join-Path $bridgeRoot 'bridge-out.log'
$bridgeErr = Join-Path $bridgeRoot 'bridge-err.log'
$bridge = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('server.mjs') -WorkingDirectory $bridgeRoot -WindowStyle Hidden -RedirectStandardOutput $bridgeOut -RedirectStandardError $bridgeErr -PassThru
try {
Start-Sleep -Seconds 2
if ($bridge.HasExited) { throw "Jack bridge stopped. Read $bridgeErr" }
try {
    $health = Invoke-RestMethod "$localUrl/health" -TimeoutSec 5
    if (-not $health.ok) { throw 'Local bridge health failed.' }
} catch { throw "Jack bridge failed to start. Read $bridgeErr" }

Write-Host 'Starting the stable Tailscale Funnel. First use may open a browser approval page.'
$funnelOutput = & $tailscalePath funnel --bg 8765 2>&1 | Out-String
Write-Host $funnelOutput
if ($LASTEXITCODE -ne 0) { throw 'Tailscale Funnel did not start. Complete Tailscale sign-in and Funnel approval, then retry.' }

$publicReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $remoteHealth = Invoke-RestMethod "$publicUrl/health" -TimeoutSec 5
        if ($remoteHealth.ok) { $publicReady = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (-not $publicReady) {
    throw "Funnel is configured, but $publicUrl/health is not reachable. Check Tailscale Funnel status and this laptop's internet connection."
}

$config = @{apiBase = $publicUrl} | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($publicConfigPath, $config, [System.Text.UTF8Encoding]::new($false))
Push-Location $projectRoot
try {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $deployOutput = & firebase.cmd deploy --only hosting --project jack-speaksmart-ai-2026 2>&1 | Out-String }
    finally { $ErrorActionPreference = $previousErrorAction }
    Write-Host $deployOutput
    if ($LASTEXITCODE -ne 0 -or $deployOutput -notmatch 'Deploy complete!') { throw 'Firebase deployment failed.' }
} finally { Pop-Location }

@{bridgePid = $bridge.Id; tunnelPid = 0; tunnelUrl = $publicUrl; tunnelType = 'tailscale'} | ConvertTo-Json -Compress | Set-Content -LiteralPath $runStatePath -Encoding utf8
Write-Host "Jack is online at https://jack-speaksmart-ai-2026.web.app/ via $publicUrl"
Write-Host 'The laptop, Ollama, Tailscale, and this bridge must stay running for AI and voice.'
if ($StayAlive) {
    Write-Host 'Keep this window open. Close it to stop the Jack bridge.'
    try {
        while ($true) {
            Start-Sleep -Seconds 15
            if ($bridge.HasExited) { throw "Jack bridge stopped. Read $bridgeErr" }
            try { $null = Invoke-RestMethod "$localUrl/health" -TimeoutSec 5 }
            catch { Write-Warning 'Jack bridge is not answering locally.' }
        }
    } finally {
        Stop-Process -Id $bridge.Id -ErrorAction SilentlyContinue
    }
}
} catch {
    if ($bridge -and -not $bridge.HasExited) { Stop-Process -Id $bridge.Id -ErrorAction SilentlyContinue }
    throw
}
