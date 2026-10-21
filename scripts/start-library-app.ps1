$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pgIsReady = Join-Path $env:ProgramFiles 'PostgreSQL\17\bin\pg_isready.exe'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$deadline = (Get-Date).AddMinutes(2)

while ((Get-Date) -lt $deadline) {
    & $pgIsReady -h 127.0.0.1 -p 5433 *> $null
    if ($LASTEXITCODE -eq 0) {
        $logs = Join-Path $root 'logs'
        New-Item -ItemType Directory -Force -Path $logs | Out-Null
        $process = Start-Process `
            -FilePath $node `
            -ArgumentList @((Join-Path $root 'src\server.js')) `
            -WorkingDirectory $root `
            -NoNewWindow `
            -RedirectStandardOutput (Join-Path $logs 'app-console.log') `
            -RedirectStandardError (Join-Path $logs 'app-error.log') `
            -PassThru `
            -Wait
        if ($process.ExitCode -ne 0) {
            throw "The library app exited with code $($process.ExitCode). Check logs\app-error.log."
        }
        exit 0
    }
    Start-Sleep -Seconds 2
}

throw 'PostgreSQL did not become ready on port 5433 within two minutes.'
