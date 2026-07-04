# Local HTTPS Setup

This setup enables HTTPS for the local Docker-based BigTom application. It is intended for development on Windows with Docker Desktop and PowerShell.

## Architecture

TLS terminates in the existing frontend Nginx container. The browser connects to Nginx over HTTPS on port 443. Nginx serves the React application and proxies `/api/` requests to the FastAPI backend through the private Docker network at `http://backend:8000`.

The backend continues to use plain HTTP inside Docker. No backend TLS, public domain, Let's Encrypt, or Certbot configuration is part of this local setup.

## Prerequisites

- Docker Desktop with Docker Compose
- PowerShell
- `mkcert`

Install `mkcert` with a Windows package manager such as Chocolatey, Scoop, or winget. Example:

```powershell
winget install FiloSottile.mkcert
```

## Generate The Local Certificate

Run this from the repository root:

```powershell
.\scripts\generate-dev-certificate.ps1
```

The script installs the local mkcert CA if needed and creates:

```text
certs/bigtom-local.pem
certs/bigtom-local-key.pem
```

The certificate covers:

- `localhost`
- `127.0.0.1`
- `::1`

To add a LAN IP address, pass it explicitly:

```powershell
.\scripts\generate-dev-certificate.ps1 -LanIp 192.168.1.50
```

The script sets `TRUST_STORES=system` only while running `mkcert -install`, then restores the previous value. This avoids a known Windows issue where `mkcert -install` also tries to update Java's `cacerts` store and fails when the JDK directory is not writable.

Do not commit certificate files, private keys, or mkcert CA files. Never share `rootCA-key.pem`; that key can sign certificates trusted by machines that trust your mkcert root.

## Optional Local Machine Trust

Most local development only needs the normal mkcert installation. If a machine or browser policy requires the mkcert root in `Cert:\LocalMachine\Root`, run the script explicitly from an elevated PowerShell session:

```powershell
.\scripts\generate-dev-certificate.ps1 -InstallForLocalMachine
```

This imports only `rootCA.pem`. It never imports, copies, or exposes `rootCA-key.pem`. Installing a root CA at machine scope affects all users on the machine, so use it only on development machines you control.

## Start Docker

```powershell
docker compose up --build
```

or in the background:

```powershell
docker compose up --build -d
```

Expected URLs:

| Purpose | URL |
|---|---|
| React application | `https://localhost/` |
| Upload page | `https://localhost/upload` |
| Backend status through proxy | `https://localhost/api/v1/status/<job-id>` |
| Backend direct Swagger, if backend port is exposed | `http://localhost:8000/docs` |

HTTP requests to `http://localhost/` are redirected to `https://localhost/`.

## Validate

Run the diagnostic script:

```powershell
.\scripts\diagnose-https.ps1
```

It checks the local certificate and key, Git ignore rules, certificate metadata, mkcert root trust stores, Windows chain building, Docker service and port state, the certificate mounted in Nginx, HTTP to HTTPS redirect behavior, HTTPS status, FastAPI proxying, and the certificate actually presented on port 443. It does not print private key material and does not require OpenSSL inside the Nginx container.

Manual checks:

```powershell
docker compose exec frontend nginx -t
curl.exe -I http://localhost
curl.exe --ssl-no-revoke -I https://localhost
curl.exe --ssl-no-revoke -i https://localhost/api/v1/status/not-a-real-job
```

On Windows, `curl.exe --ssl-no-revoke` keeps certificate validation enabled but disables revocation checking. This is useful for local mkcert certificates because revocation endpoints are normally not available. Do not use `-k` as the final documented validation path because it disables certificate validation.

Expected results:

- `http://localhost` returns `301` with `Location: https://localhost/...`.
- `https://localhost` returns `200`.
- `/api/v1/status/not-a-real-job` returns a JSON `404` from FastAPI.
- `docker compose exec frontend nginx -t` reports that the configuration syntax is valid.

## Trust Boundaries

Application HTTPS correctness means that Docker publishes ports 80 and 443, Nginx serves the configured certificate, HTTP redirects to HTTPS, and `/api/` traffic reaches FastAPI through the reverse proxy.

Operating-system trust means Windows can build a certificate chain from `certs/bigtom-local.pem` to the mkcert root CA in a trusted root store.

Browser trust is the browser's own decision after applying OS trust, browser-specific certificate caches, enterprise policies, antivirus HTTPS inspection, proxy or VPN configuration, and the actual network endpoint reached by the browser.

If the diagnostic script passes but Chromium-based browsers still show `ERR_CERT_AUTHORITY_INVALID`, the repository-side HTTPS setup is probably correct and the remaining cause is likely browser, policy, antivirus, proxy, VPN, or operating-system specific.

## Verify mkcert Root Trust

Find the mkcert CA directory:

```powershell
mkcert -CAROOT
```

Check the Windows stores:

```powershell
Get-ChildItem Cert:\CurrentUser\Root | Where-Object Subject -Like "*mkcert*"
Get-ChildItem Cert:\LocalMachine\Root | Where-Object Subject -Like "*mkcert*"
```

If `mkcert -install` fails with a Java `cacerts` access error, rerun with the system trust store restriction:

```powershell
$oldTrustStores = $env:TRUST_STORES
try {
    $env:TRUST_STORES = "system"
    mkcert -install
}
finally {
    if ($null -ne $oldTrustStores) {
        $env:TRUST_STORES = $oldTrustStores
    }
    else {
        Remove-Item Env:\TRUST_STORES -ErrorAction SilentlyContinue
    }
}
```

The generation script already does this automatically.

## Troubleshooting

### Missing Certificate Files

If the frontend container fails to start with a certificate error, generate the local certificate first:

```powershell
.\scripts\generate-dev-certificate.ps1
```

Confirm that both files exist under `certs/`.

### Browser Shows ERR_CERT_AUTHORITY_INVALID

This means the browser does not trust the issuer of the certificate it received. First run:

```powershell
.\scripts\diagnose-https.ps1
```

If the script confirms that Windows chain validation succeeds and the presented certificate hash matches the local certificate, check:

- Restart the browser so it reloads certificate trust.
- Check `chrome://policy` or the equivalent Chromium policy page for certificate or proxy policies.
- Disable or configure antivirus HTTPS inspection for local development.
- Disconnect proxy or VPN software temporarily and retest.
- Confirm no other process owns port 443:

```powershell
netstat -ano | findstr ":443"
```

- Test IPv4 and IPv6 explicitly:

```powershell
curl.exe --ssl-no-revoke -I https://127.0.0.1
curl.exe --ssl-no-revoke -I https://localhost
```

The mkcert leaf certificate is sufficient for this local setup. Nginx does not need a separate public CA chain file for mkcert because the mkcert root CA is installed in the local trust store. Compose bind-mounts `./certs/bigtom-local.pem` and `./certs/bigtom-local-key.pem`; it does not copy old certificate files into the image during build.

### Hostname Mismatch

Use a hostname or IP address included in the certificate. By default, the certificate is valid for `localhost`, `127.0.0.1`, and `::1`. For LAN testing, regenerate it with `-LanIp`.

### Port 80 Or 443 Already In Use

Stop the process using the port or adjust the host port mapping locally. On Windows, inspect ports with:

```powershell
netstat -ano | findstr ":80"
netstat -ano | findstr ":443"
```

### Mixed-Content Errors

Mixed content occurs when an HTTPS page calls `http://...` resources. Frontend API calls should use relative paths such as `/api/v1/...`. Search the frontend for hardcoded HTTP backend URLs:

```powershell
rg "http://localhost:8000|localhost:8000" frontend\app\src
```
