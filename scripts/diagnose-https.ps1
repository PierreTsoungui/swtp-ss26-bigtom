$ErrorActionPreference = "Continue"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$certPath = Join-Path $repoRoot "certs\bigtom-local.pem"
$keyPath = Join-Path $repoRoot "certs\bigtom-local-key.pem"
$nginxCertPath = "/etc/nginx/certs/bigtom-local.pem"

$script:Results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("PASS", "WARN", "FAIL")]
        [string]$Status,
        [Parameter(Mandatory = $true)]
        [string]$Check,
        [string]$Detail = ""
    )

    $script:Results.Add([pscustomobject]@{
        Status = $Status
        Check = $Check
        Detail = $Detail
    }) | Out-Null
}

function Get-PemCertificate {
    param([Parameter(Mandatory = $true)][string]$Path)

    $content = Get-Content -Raw -Path $Path -ErrorAction Stop
    $match = [regex]::Match($content, "-----BEGIN CERTIFICATE-----(?<body>.*?)-----END CERTIFICATE-----", [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $match.Success) {
        throw "No PEM certificate block was found in '$Path'."
    }

    $base64 = ($match.Groups["body"].Value -replace "\s", "")
    $bytes = [Convert]::FromBase64String($base64)
    return [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($bytes)
}

function Get-CertificateSha256 {
    param([Parameter(Mandatory = $true)][System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        return (($sha256.ComputeHash($Certificate.RawData) | ForEach-Object { $_.ToString("x2") }) -join "")
    }
    finally {
        $sha256.Dispose()
    }
}

function Get-FileSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

function Test-GitIgnored {
    param([Parameter(Mandatory = $true)][string]$Path)

    & git -C $repoRoot check-ignore -q -- $Path
    return $LASTEXITCODE -eq 0
}

function Get-MkcertRootCertificate {
    $mkcert = Get-Command mkcert -ErrorAction SilentlyContinue
    if (-not $mkcert) {
        return $null
    }

    $caroot = & mkcert -CAROOT 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $caroot) {
        return $null
    }

    $rootPath = Join-Path ($caroot | Select-Object -First 1) "rootCA.pem"
    if (-not (Test-Path $rootPath)) {
        return $null
    }

    return Get-PemCertificate -Path $rootPath
}

function Test-CertStoreContains {
    param(
        [Parameter(Mandatory = $true)][string]$StorePath,
        [System.Security.Cryptography.X509Certificates.X509Certificate2]$RootCertificate
    )

    $certs = Get-ChildItem $StorePath -ErrorAction Stop
    if ($RootCertificate) {
        return [bool]($certs | Where-Object { $_.Thumbprint -eq $RootCertificate.Thumbprint } | Select-Object -First 1)
    }

    return [bool]($certs | Where-Object { $_.Subject -like "*mkcert*" -or $_.Issuer -like "*mkcert*" } | Select-Object -First 1)
}

function Test-CertificateChain {
    param([Parameter(Mandatory = $true)][System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate)

    $chain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
    try {
        $chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
        $chain.ChainPolicy.RevocationFlag = [System.Security.Cryptography.X509Certificates.X509RevocationFlag]::ExcludeRoot
        $chain.ChainPolicy.VerificationFlags = [System.Security.Cryptography.X509Certificates.X509VerificationFlags]::NoFlag
        $ok = $chain.Build($Certificate)
        $status = ($chain.ChainStatus | ForEach-Object { "$($_.Status): $($_.StatusInformation.Trim())" }) -join "; "
        return [pscustomobject]@{ Ok = $ok; Status = $status }
    }
    finally {
        $chain.Dispose()
    }
}

function Get-RemoteCertificate {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [int]$Port = 443,
        [string]$TargetHost = "localhost"
    )

    $address = $null
    if ([System.Net.IPAddress]::TryParse($HostName, [ref]$address)) {
        $tcp = [System.Net.Sockets.TcpClient]::new($address.AddressFamily)
    }
    else {
        $tcp = [System.Net.Sockets.TcpClient]::new()
    }

    try {
        if ($address) {
            $connectTask = $tcp.ConnectAsync($address, $Port)
        }
        else {
            $connectTask = $tcp.ConnectAsync($HostName, $Port)
        }

        if (-not $connectTask.Wait(5000)) {
            throw "Timed out connecting to ${HostName}:$Port."
        }

        $callback = [System.Net.Security.RemoteCertificateValidationCallback]{ param($sender, $certificate, $chain, $errors) return $true }
        $ssl = [System.Net.Security.SslStream]::new($tcp.GetStream(), $false, $callback)
        try {
            $ssl.AuthenticateAsClient($TargetHost)
            if (-not $ssl.RemoteCertificate) {
                throw "No remote certificate was presented."
            }
            return [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($ssl.RemoteCertificate)
        }
        finally {
            $ssl.Dispose()
        }
    }
    finally {
        $tcp.Dispose()
    }
}

function Invoke-Curl {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $output = & curl.exe @Arguments 2>&1
    return [pscustomobject]@{
        ExitCode = $LASTEXITCODE
        Output = ($output -join "`n")
    }
}

Push-Location $repoRoot
try {
    Write-Host "BigTom HTTPS diagnostics"
    Write-Host "Repository: $repoRoot"
    Write-Host ""

    $certExists = Test-Path $certPath
    $keyExists = Test-Path $keyPath
    Add-Result -Status ($(if ($certExists) { "PASS" } else { "FAIL" })) -Check "Local certificate exists" -Detail $certPath
    Add-Result -Status ($(if ($keyExists) { "PASS" } else { "FAIL" })) -Check "Local private key exists" -Detail $keyPath

    Add-Result -Status ($(if (Test-GitIgnored "certs/bigtom-local.pem") { "PASS" } else { "FAIL" })) -Check "Certificate is ignored by Git" -Detail "certs/bigtom-local.pem"
    Add-Result -Status ($(if (Test-GitIgnored "certs/bigtom-local-key.pem") { "PASS" } else { "FAIL" })) -Check "Private key is ignored by Git" -Detail "certs/bigtom-local-key.pem"

    $localCert = $null
    $localSha256 = $null
    $localFileSha256 = $null
    if ($certExists) {
        try {
            $localCert = Get-PemCertificate -Path $certPath
            $localSha256 = Get-CertificateSha256 -Certificate $localCert
            $localFileSha256 = Get-FileSha256 -Path $certPath
            Add-Result -Status "PASS" -Check "Certificate subject" -Detail $localCert.Subject
            Add-Result -Status "PASS" -Check "Certificate issuer" -Detail $localCert.Issuer
            Add-Result -Status "PASS" -Check "Certificate validity" -Detail "$($localCert.NotBefore.ToString('u')) to $($localCert.NotAfter.ToString('u'))"

            $san = ($localCert.Extensions | Where-Object { $_.Oid.Value -eq "2.5.29.17" } | Select-Object -First 1)
            if ($san) {
                Add-Result -Status "PASS" -Check "Certificate SAN entries" -Detail $san.Format($true)
            }
            else {
                Add-Result -Status "FAIL" -Check "Certificate SAN entries" -Detail "No Subject Alternative Name extension found."
            }

            Add-Result -Status "PASS" -Check "Local certificate SHA-256" -Detail $localSha256
            Add-Result -Status "PASS" -Check "Local certificate file SHA-256" -Detail $localFileSha256
        }
        catch {
            Add-Result -Status "FAIL" -Check "Read local certificate" -Detail $_.Exception.Message
        }
    }

    $mkcertRoot = $null
    try {
        $mkcertRoot = Get-MkcertRootCertificate
        Add-Result -Status ($(if ($mkcertRoot) { "PASS" } else { "WARN" })) -Check "mkcert rootCA.pem located" -Detail ($(if ($mkcertRoot) { $mkcertRoot.Subject } else { "mkcert -CAROOT did not return a readable rootCA.pem." }))
    }
    catch {
        Add-Result -Status "WARN" -Check "mkcert rootCA.pem located" -Detail $_.Exception.Message
    }

    foreach ($store in @("Cert:\CurrentUser\Root", "Cert:\LocalMachine\Root")) {
        try {
            $exists = Test-CertStoreContains -StorePath $store -RootCertificate $mkcertRoot
            Add-Result -Status ($(if ($exists) { "PASS" } else { "WARN" })) -Check "mkcert root exists in $store" -Detail ($(if ($exists) { "Found trusted mkcert root." } else { "No matching mkcert root was found." }))
        }
        catch {
            Add-Result -Status "WARN" -Check "mkcert root exists in $store" -Detail $_.Exception.Message
        }
    }

    if ($localCert) {
        $chainResult = Test-CertificateChain -Certificate $localCert
        Add-Result -Status ($(if ($chainResult.Ok) { "PASS" } else { "FAIL" })) -Check "Windows certificate chain builds without revocation checking" -Detail $chainResult.Status
    }

    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($docker) {
        $composePs = & docker compose ps 2>&1
        $composeExit = $LASTEXITCODE
        Add-Result -Status ($(if ($composeExit -eq 0) { "PASS" } else { "FAIL" })) -Check "docker compose ps" -Detail (($composePs | Select-Object -First 8) -join " | ")

        if ($composeExit -eq 0) {
            $psText = $composePs -join "`n"
            Add-Result -Status ($(if ($psText -match "frontend" -and $psText -match "Up|running") { "PASS" } else { "FAIL" })) -Check "Frontend service is running" -Detail "docker compose ps"
            Add-Result -Status ($(if ($psText -match "backend" -and $psText -match "Up|running") { "PASS" } else { "FAIL" })) -Check "Backend service is running" -Detail "docker compose ps"
            Add-Result -Status ($(if ($psText -match "r_worker" -and $psText -match "Up|running") { "PASS" } else { "WARN" })) -Check "R worker service is running" -Detail "docker compose ps"
            Add-Result -Status ($(if ($psText -match "(0\.0\.0\.0|\[::\]|127\.0\.0\.1):80->80/tcp|80/tcp") { "PASS" } else { "FAIL" })) -Check "Port 80 is published" -Detail "docker compose ps"
            Add-Result -Status ($(if ($psText -match "(0\.0\.0\.0|\[::\]|127\.0\.0\.1):443->443/tcp|443/tcp") { "PASS" } else { "FAIL" })) -Check "Port 443 is published" -Detail "docker compose ps"
        }

        $containerHashOutput = & docker compose exec -T frontend sha256sum $nginxCertPath 2>&1
        $containerHashExit = $LASTEXITCODE
        if ($containerHashExit -eq 0) {
            $containerHash = (($containerHashOutput | Select-Object -First 1) -split "\s+")[0].ToLowerInvariant()
            Add-Result -Status ($(if ($localFileSha256 -and $containerHash -eq $localFileSha256) { "PASS" } else { "FAIL" })) -Check "Nginx-mounted certificate file matches local certificate file" -Detail $containerHash
        }
        else {
            Add-Result -Status "FAIL" -Check "Nginx-mounted certificate hash" -Detail ($containerHashOutput -join "`n")
        }
    }
    else {
        Add-Result -Status "FAIL" -Check "Docker CLI available" -Detail "docker was not found in PATH."
    }

    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        $http = Invoke-Curl -Arguments @("-sS", "-I", "http://localhost")
        $httpOk = $http.ExitCode -eq 0 -and $http.Output -match "HTTP/1\.[01] 301" -and $http.Output -match "Location:\s*https://localhost"
        Add-Result -Status ($(if ($httpOk) { "PASS" } else { "FAIL" })) -Check "HTTP redirects to HTTPS" -Detail (($http.Output -split "`n" | Select-Object -First 3) -join " | ")

        $https = Invoke-Curl -Arguments @("-sS", "--ssl-no-revoke", "-I", "https://localhost")
        $httpsOk = $https.ExitCode -eq 0 -and $https.Output -match "HTTP/1\.[01] 200"
        Add-Result -Status ($(if ($httpsOk) { "PASS" } else { "FAIL" })) -Check "HTTPS returns HTTP 200" -Detail (($https.Output -split "`n" | Select-Object -First 3) -join " | ")

        $api = Invoke-Curl -Arguments @("-sS", "--ssl-no-revoke", "-i", "https://localhost/api/v1/status/not-a-real-job")
        $apiOk = $api.ExitCode -eq 0 -and $api.Output -match "HTTP/1\.[01] 404" -and $api.Output -match "application/json"
        Add-Result -Status ($(if ($apiOk) { "PASS" } else { "FAIL" })) -Check "HTTPS /api reaches FastAPI" -Detail (($api.Output -split "`n" | Select-Object -First 6) -join " | ")
    }
    else {
        Add-Result -Status "WARN" -Check "curl.exe checks" -Detail "curl.exe was not found in PATH."
    }

    if ($localSha256) {
        foreach ($endpoint in @("localhost", "127.0.0.1", "::1")) {
            try {
                $remoteCert = Get-RemoteCertificate -HostName $endpoint -TargetHost "localhost"
                $remoteHash = Get-CertificateSha256 -Certificate $remoteCert
                Add-Result -Status ($(if ($remoteHash -eq $localSha256) { "PASS" } else { "FAIL" })) -Check "Presented certificate matches local certificate on ${endpoint}:443" -Detail $remoteHash
            }
            catch {
                Add-Result -Status "WARN" -Check "Presented certificate matches local certificate on ${endpoint}:443" -Detail $_.Exception.Message
            }
        }
    }

    foreach ($port in @(80, 443)) {
        try {
            $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
            $details = ($listeners | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort) pid=$($_.OwningProcess)" }) -join "; "
            Add-Result -Status ($(if ($listeners) { "PASS" } else { "FAIL" })) -Check "Windows listener on port $port" -Detail $details
        }
        catch {
            Add-Result -Status "WARN" -Check "Windows listener on port $port" -Detail $_.Exception.Message
        }
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Results"
foreach ($result in $script:Results) {
    $line = "{0,-4} {1}" -f $result.Status, $result.Check
    if ($result.Detail) {
        $line = "$line - $($result.Detail)"
    }
    Write-Host $line
}

$passCount = @($script:Results | Where-Object { $_.Status -eq "PASS" }).Count
$warnCount = @($script:Results | Where-Object { $_.Status -eq "WARN" }).Count
$failCount = @($script:Results | Where-Object { $_.Status -eq "FAIL" }).Count

Write-Host ""
Write-Host "Summary: PASS=$passCount WARN=$warnCount FAIL=$failCount"

if ($failCount -gt 0) {
    exit 1
}

if ($warnCount -gt 0) {
    exit 2
}

exit 0
