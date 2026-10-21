$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root '.env'
if (Test-Path $envPath) {
    throw '.env already exists. Keep it to preserve credentials, or rotate each service password deliberately.'
}

$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
function New-Secret {
    param([int]$ByteCount)
    $bytes = New-Object byte[] $ByteCount
    $random.GetBytes($bytes)
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

$content = @(
    'PORT=3000'
    'DATABASE_URL=postgres://library:SET_LOCAL_DATABASE_PASSWORD@127.0.0.1:5433/library'
    "JWT_SECRET=$(New-Secret 48)"
    'ADMIN_USERNAME=admin'
    "ADMIN_PASSWORD=$(New-Secret 24)"
    'COOKIE_SECURE=false'
    "POSTGRES_PASSWORD=$(New-Secret 32)"
    'PGADMIN_DEFAULT_EMAIL=admin@librarydemo.com'
    "PGADMIN_DEFAULT_PASSWORD=$(New-Secret 24)"
    "GRAFANA_ADMIN_PASSWORD=$(New-Secret 24)"
)

try {
    Set-Content -Path $envPath -Value $content -Encoding ascii
    $security = New-Object System.Security.AccessControl.FileSecurity
    $security.SetAccessRuleProtection($true, $false)
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $currentUser,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        [System.Security.AccessControl.AccessControlType]::Allow
    )
    $security.AddAccessRule($rule)
    Set-Acl -Path $envPath -AclObject $security
} finally {
    $random.Dispose()
}

Write-Output 'Created .env with unique cryptographically generated secrets. Keep it private; it is excluded from Git.'
