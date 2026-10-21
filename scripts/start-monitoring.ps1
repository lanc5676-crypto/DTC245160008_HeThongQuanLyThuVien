$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$prometheusDirectory = Get-ChildItem (Join-Path $root 'tools') -Directory -Filter 'prometheus-*.windows-amd64' |
    Select-Object -First 1
if (-not $prometheusDirectory) {
    throw 'Prometheus is not installed. Install it with the setup instructions in README.md.'
}

$prometheusPort = 9090
$grafanaUrl = 'http://127.0.0.1:3000'
$prometheusUrl = "http://127.0.0.1:$prometheusPort"
$appUrl = 'http://127.0.0.1:8082'
$dataDirectory = Join-Path $root 'data'
$prometheusConfig = Join-Path $root 'monitoring\prometheus-local.yml'
$envFile = Join-Path $root '.env'
$grafanaPasswordLine = Get-Content $envFile -ErrorAction SilentlyContinue |
    Where-Object { $_ -match '^GRAFANA_ADMIN_PASSWORD=' } |
    Select-Object -First 1
if (-not $grafanaPasswordLine) {
    throw 'GRAFANA_ADMIN_PASSWORD is missing. Create .env with .\scripts\new-demo-secrets.ps1.'
}
$grafanaPassword = $grafanaPasswordLine.Substring('GRAFANA_ADMIN_PASSWORD='.Length)

if (-not (Get-NetTCPConnection -State Listen -LocalPort $prometheusPort -ErrorAction SilentlyContinue)) {
    Start-Process `
        -FilePath (Join-Path $prometheusDirectory.FullName 'prometheus.exe') `
        -ArgumentList @(
            "--config.file=$prometheusConfig",
            "--storage.tsdb.path=$(Join-Path $dataDirectory 'prometheus')",
            "--web.listen-address=127.0.0.1:$prometheusPort"
        ) `
        -WorkingDirectory $prometheusDirectory.FullName `
        -PassThru | Out-Null
}

$deadline = (Get-Date).AddSeconds(30)
$prometheusReady = $false
while ((Get-Date) -lt $deadline) {
    try {
        $null = Invoke-RestMethod "$prometheusUrl/-/ready" -TimeoutSec 2
        $prometheusReady = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $prometheusReady) {
    throw "Prometheus did not become ready at $prometheusUrl."
}

$scrapeHealthy = $false
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
    try {
        $targets = Invoke-RestMethod "$prometheusUrl/api/v1/targets" -TimeoutSec 8
        $target = $targets.data.activeTargets |
            Where-Object { $_.labels.job -eq 'library_app' } |
            Select-Object -First 1
        if ($target -and $target.health -eq 'up') {
            $scrapeHealthy = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
    Start-Sleep -Seconds 2
}
if (-not $scrapeHealthy) {
    throw "Prometheus cannot scrape $appUrl/metrics. Start the app with .\scripts\install-local-tasks.ps1."
}

$credential = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:$grafanaPassword"))
$headers = @{ Authorization = "Basic $credential" }
$sources = Invoke-RestMethod "$grafanaUrl/api/datasources" -Headers $headers -TimeoutSec 5
if (-not ($sources | Where-Object { $_.name -eq 'Prometheus' })) {
    $body = @{
        name = 'Prometheus'
        type = 'prometheus'
        access = 'proxy'
        url = $prometheusUrl
        isDefault = $true
        editable = $true
    } | ConvertTo-Json
    $null = Invoke-RestMethod "$grafanaUrl/api/datasources" `
        -Method Post `
        -Headers $headers `
        -ContentType 'application/json' `
        -Body $body `
        -TimeoutSec 8
    Write-Output 'Added the Prometheus datasource to Grafana.'
}

Write-Output "Application: $appUrl"
Write-Output "Grafana: $grafanaUrl"
Write-Output "Prometheus: $prometheusUrl/targets"
