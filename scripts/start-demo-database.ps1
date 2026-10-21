$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$postgresBin = Join-Path $env:ProgramFiles 'PostgreSQL\17\bin'
$pgCtl = Join-Path $postgresBin 'pg_ctl.exe'
$pgIsReady = Join-Path $postgresBin 'pg_isready.exe'
$dataDirectory = Join-Path $root 'data\postgres-demo'
$logFile = Join-Path $root 'data\postgres-demo.log'

foreach ($path in @($pgCtl, $pgIsReady, $dataDirectory)) {
    if (-not (Test-Path $path)) {
        throw "Required PostgreSQL demo file was not found: $path"
    }
}

& $pgIsReady -h 127.0.0.1 -p 5433 *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Output 'Demo PostgreSQL is already accepting connections on port 5433.'
    exit 0
}

& $pgCtl -D $dataDirectory -l $logFile -o '-h 127.0.0.1 -p 5433' -w start
if ($LASTEXITCODE -ne 0) {
    throw 'Could not start the PostgreSQL demo database.'
}
