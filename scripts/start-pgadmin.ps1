$ErrorActionPreference = 'Stop'

$candidates = @(
    (Join-Path $env:ProgramFiles 'pgAdmin 4\runtime\pgAdmin4.exe'),
    (Join-Path $env:ProgramFiles 'pgAdmin 4\v9\runtime\pgAdmin4.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\pgAdmin 4\runtime\pgAdmin4.exe')
)
$executable = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $executable) {
    $shortcut = Get-ChildItem (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs') `
        -Filter '*pgAdmin*.lnk' -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($shortcut) {
        Start-Process $shortcut.FullName
        exit 0
    }
    throw 'pgAdmin 4 was not found. Install PostgreSQL.pgAdmin with winget.'
}

& (Join-Path $PSScriptRoot 'register-pgadmin-server.ps1')
Start-Process $executable
Write-Output 'Started pgAdmin 4.'
Write-Output 'In pgAdmin, expand Servers > Library Demo and enter the PostgreSQL password from the project .env file.'
