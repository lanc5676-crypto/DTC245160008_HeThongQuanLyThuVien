$ErrorActionPreference = 'Stop'

$pgAdminRoot = Join-Path $env:LOCALAPPDATA 'Programs\pgAdmin 4'
$python = Join-Path $pgAdminRoot 'python\python.exe'
$setup = Join-Path $pgAdminRoot 'web\setup.py'
$database = Join-Path $env:APPDATA 'pgAdmin\pgadmin4.db'
$serverDefinition = Join-Path (Split-Path -Parent $PSScriptRoot) 'db\pgadmin-servers.json'
$pgAdminUser = 'pgadmin4@pgadmin.org'
$postgresBin = Join-Path $env:ProgramFiles 'PostgreSQL\17\bin'
if (Test-Path $postgresBin) {
    $env:PATH = "$postgresBin;$env:PATH"
}

foreach ($path in @($python, $setup, $database, $serverDefinition)) {
    if (-not (Test-Path $path)) {
        throw "Required pgAdmin setup file was not found: $path"
    }
}

$checkServer = @'
import sqlite3
import sys

connection = sqlite3.connect(sys.argv[1])
row = connection.execute(
    "SELECT s.id FROM server s JOIN \"user\" u ON u.id = s.user_id "
    "WHERE u.username = ? AND s.name = ?",
    (sys.argv[2], "Library Demo"),
).fetchone()
connection.close()
print("registered" if row else "missing")
'@
$registration = $checkServer | python - $database $pgAdminUser
if ($LASTEXITCODE -ne 0) {
    throw 'Could not check the pgAdmin server registry.'
}

if ($registration.Trim() -eq 'registered') {
    Write-Output 'The Library Demo PostgreSQL server is already registered in pgAdmin.'
    return
}

Push-Location (Split-Path -Parent $setup)
try {
    & $python $setup load-servers $serverDefinition --user $pgAdminUser --sqlite-path $database
    if ($LASTEXITCODE -ne 0) {
        throw 'pgAdmin failed to import the Library Demo server definition.'
    }
} finally {
    Pop-Location
}

$registration = $checkServer | python - $database $pgAdminUser
if ($LASTEXITCODE -ne 0 -or $registration.Trim() -ne 'registered') {
    throw 'pgAdmin did not save the Library Demo server. Review the import output above.'
}

Write-Output 'Registered Library Demo in pgAdmin. Enter the PostgreSQL password when prompted.'
