$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$prometheus = Join-Path $root 'tools\prometheus-3.15.0.windows-amd64\prometheus.exe'
if (-not (Test-Path $prometheus)) {
    throw 'Prometheus is missing. Download its official Windows release into tools first.'
}

$actions = @(
    @{
        Name = 'LibraryDemoDatabase'
        Action = New-ScheduledTaskAction `
            -Execute (Join-Path $PSHOME 'powershell.exe') `
            -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'start-demo-database.ps1')`"" `
            -WorkingDirectory $root
    },
    @{
        Name = 'LibraryManagementApp'
        Action = New-ScheduledTaskAction `
            -Execute (Join-Path $PSHOME 'powershell.exe') `
            -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'start-library-app.ps1')`"" `
            -WorkingDirectory $root
    },
    @{
        Name = 'LibraryPrometheus'
        Action = New-ScheduledTaskAction `
            -Execute (Join-Path $PSHOME 'powershell.exe') `
            -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'start-local-prometheus.ps1')`"" `
            -WorkingDirectory $root
    }
)

$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -DontStopOnIdleEnd `
    -DisallowHardTerminate `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

foreach ($item in $actions) {
    $task = New-ScheduledTask -Action $item.Action -Trigger $trigger -Principal $principal -Settings $settings
    Register-ScheduledTask -TaskName $item.Name -InputObject $task -Force -ErrorAction Stop | Out-Null
}

foreach ($name in @('LibraryDemoDatabase', 'LibraryManagementApp', 'LibraryPrometheus')) {
    Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
}

Start-ScheduledTask -TaskName 'LibraryDemoDatabase'
$pgIsReady = Join-Path $env:ProgramFiles 'PostgreSQL\17\bin\pg_isready.exe'
$databaseReady = $false
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
    & $pgIsReady -h 127.0.0.1 -p 5433 *> $null
    if ($LASTEXITCODE -eq 0) {
        $databaseReady = $true
        break
    }
    Start-Sleep -Seconds 2
}
if (-not $databaseReady) {
    throw 'The PostgreSQL demo database did not become ready on port 5433.'
}
Write-Output 'Started LibraryDemoDatabase.'

foreach ($name in @('LibraryManagementApp', 'LibraryPrometheus')) {
    Start-ScheduledTask -TaskName $name
    Write-Output "Started $name."
}
