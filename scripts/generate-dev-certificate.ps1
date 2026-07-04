param(
    [string]$LanIp,
    [switch]$InstallForLocalMachine
)

$ErrorActionPreference = "Stop"

$certDir = Join-Path $PSScriptRoot "..\certs"
$certPath = Join-Path $certDir "bigtom-local.pem"
$keyPath = Join-Path $certDir "bigtom-local-key.pem"

function Write-Failure {
    param([string]$Message)
    Write-Error "ERROR: $Message"
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-Mkcert {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    & mkcert @Arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Write-Failure "$FailureMessage mkcert exit code: $exitCode."
        exit $exitCode
    }
}

Write-Host "Checking mkcert installation..."
$mkcert = Get-Command mkcert -ErrorAction SilentlyContinue
if (-not $mkcert) {
    Write-Failure "mkcert was not found. Install it first, then rerun this script. See docs/HTTPS.md."
    exit 1
}

if ($InstallForLocalMachine -and -not (Test-IsAdministrator)) {
    Write-Failure "-InstallForLocalMachine requires an elevated PowerShell session. Restart PowerShell as Administrator and rerun the command."
    exit 1
}

if (-not (Test-Path $certDir)) {
    Write-Host "Creating certificate directory: $certDir"
    New-Item -ItemType Directory -Path $certDir | Out-Null
}

$previousTrustStores = [Environment]::GetEnvironmentVariable("TRUST_STORES", "Process")
$hadTrustStores = $null -ne $previousTrustStores

try {
    Write-Host "Installing the local mkcert CA in the Windows system trust store..."
    $env:TRUST_STORES = "system"
    Invoke-Mkcert -Arguments @("-install") -FailureMessage "mkcert CA installation failed."
}
finally {
    if ($hadTrustStores) {
        $env:TRUST_STORES = $previousTrustStores
    }
    else {
        Remove-Item Env:\TRUST_STORES -ErrorAction SilentlyContinue
    }
}

if ($InstallForLocalMachine) {
    Write-Host "Explicit LocalMachine root installation requested."
    Write-Host "Only mkcert rootCA.pem will be imported. rootCA-key.pem must never be copied, imported, shared, or committed."
    Write-Host "Security note: a trusted mkcert root CA can sign certificates trusted by this machine. Use this only for local development machines."

    $carootOutput = & mkcert -CAROOT
    $carootExitCode = $LASTEXITCODE
    if ($carootExitCode -ne 0) {
        Write-Failure "Could not locate mkcert CA root. mkcert exit code: $carootExitCode."
        exit $carootExitCode
    }

    $rootCaPath = Join-Path ($carootOutput | Select-Object -First 1) "rootCA.pem"
    if (-not (Test-Path $rootCaPath)) {
        Write-Failure "mkcert rootCA.pem was not found at '$rootCaPath'. Run mkcert -install first."
        exit 1
    }

    Import-Certificate -FilePath $rootCaPath -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
    Write-Host "mkcert rootCA.pem imported into Cert:\LocalMachine\Root."
}

$hosts = @("localhost", "127.0.0.1", "::1")
if ($LanIp) {
    $hosts += $LanIp
}

Write-Host "Generating BigTom development certificate for: $($hosts -join ', ')"
$certificateArguments = @("-cert-file", $certPath, "-key-file", $keyPath) + $hosts
Invoke-Mkcert -Arguments $certificateArguments -FailureMessage "Certificate generation failed."

if (-not (Test-Path $certPath)) {
    Write-Failure "Certificate generation finished, but '$certPath' was not found."
    exit 1
}

if (-not (Test-Path $keyPath)) {
    Write-Failure "Certificate generation finished, but '$keyPath' was not found."
    exit 1
}

Write-Host "Development certificate created successfully."
Write-Host "Certificate: $certPath"
Write-Host "Private key: $keyPath"
Write-Host "These files are local secrets and must not be committed."
