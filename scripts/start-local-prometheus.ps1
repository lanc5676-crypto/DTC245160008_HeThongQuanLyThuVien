$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$prometheusDirectory = Get-ChildItem (Join-Path $root 'tools') -Directory -Filter 'prometheus-*.windows-amd64' |
    Select-Object -First 1
if (-not $prometheusDirectory) {
    throw 'Prometheus is not installed. Install its official Windows release first.'
}

$appUrl = 'http://127.0.0.1:8082/metrics'
$deadline = (Get-Date).AddMinutes(2)
while ((Get-Date) -lt $deadline) {
    try {
        $null = Invoke-WebRequest $appUrl -UseBasicParsing -TimeoutSec 3
    } catch {
        Start-Sleep -Seconds 2
        continue
    }

    $logs = Join-Path $root 'data'
    $process = Start-Process `
        -FilePath (Join-Path $prometheusDirectory.FullName 'prometheus.exe') `
        -ArgumentList @(
            "--config.file=$(Join-Path $root 'monitoring\prometheus-local.yml')",
            "--storage.tsdb.path=$(Join-Path $root 'data\prometheus')",
            '--web.listen-address=127.0.0.1:9090'
        ) `
        -WorkingDirectory $root `
        -NoNewWindow `
        -RedirectStandardOutput (Join-Path $logs 'prometheus.log') `
        -RedirectStandardError (Join-Path $logs 'prometheus-error.log') `
        -PassThru `
        -Wait
    if ($process.ExitCode -ne 0) {
        throw "Prometheus exited with code $($process.ExitCode). Check data\prometheus-error.log."
    }
    exit 0
}

throw "Library app metrics did not become available at $appUrl within two minutes."
