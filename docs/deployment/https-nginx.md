# HTTPS, Reverse Proxy & Rate Limiting

This document describes the HTTPS/TLS configuration, the Nginx reverse proxy, and the rate-limiting concept of the application. It is intended both for the development team and for the **THM IT department**, which will handle the production deployment within the THM network.

> **Important note on scope:** This project is **not** deployed to production by us. This document prepares the deployment and describes the necessary steps that must be carried out by the THM IT department, in particular the issuance of an officially signed TLS certificate.

---

## 1. Architecture Overview

TLS terminates centrally in the `frontend` container (Nginx). Nginx handles three tasks:

1. **HTTPS termination** – encryption between the client (browser) and the server.
2. **Reverse proxy** – forwarding of `/api/*` requests to the `backend` (FastAPI/Uvicorn), which is only reachable internally via HTTP.
3. **Rate limiting** – protecting the backend from overload through IP-based request throttling, directly at the reverse-proxy level, before a request even reaches the backend.

```
Browser (HTTPS) → Nginx (TLS termination, rate limiting) → Backend (HTTP, internal)
```

The backend itself never speaks TLS at any point — it is only reachable via the internal Docker network and relies on Nginx as the sole, externally reachable entry point.

---

## 2. Current State: Local Development Setup (mkcert)

For local development, a self-signed certificate is currently generated via [`mkcert`](https://github.com/FiloSottile/mkcert) (see `HTTPS.md` in the repository for the detailed instructions). In this process, `mkcert` installs a locally generated root CA into the certificate store of the respective developer machine, which causes the browser to trust the certificate without showing a warning.

The generated files (`bigtom-local.pem`, `bigtom-local-key.pem`) are deliberately **not** version-controlled (`.gitignore`) and must be generated locally by each developer. Without these files, the `frontend` container fails to start with an Nginx certificate error.

### Why This Setup Is Not Suitable for Production

The underlying mechanism of `mkcert` — a locally generated root CA that is only trusted on the respective developer machine — works only because this CA was manually installed into the certificate store of **a single machine**. As soon as the application is hosted on a central server within the THM network, accessed by multiple users who are not IT-savvy (e.g., biologists in the lab), this model no longer works:

1. The browser of an external machine does not know the `mkcert` root CA.
2. The browser displays the security warning `ERR_CERT_AUTHORITY_INVALID`.
3. The only workaround would be to manually install the secret `mkcert` root CA on every machine that is supposed to use the application — this is not scalable in practice and is also a security concern, since the root CA of every developer machine would then carry system-wide trust for any certificate signed by that machine.

For the production deployment within the THM network, an **officially signed certificate issued by the university** is therefore required, which is trusted by default on THM-managed machines.

---

## 3. Production Deployment: Instructions for the THM IT Department

The following steps describe the process for issuing and integrating an official TLS certificate for the production deployment. These steps are carried out or coordinated **by the THM IT department**, not by the development team.

### Step 1 — Request a Domain

Request a fixed, internal domain within the THM network under which the application will be reachable, e.g.:

```
bigtom.biologie.thm.de
```

### Step 2 — Generate Key Pair and CSR

Generate a new key pair directly **on the target server**. The private key remains exclusively on the server and is never shared or committed to version control at any point. A Certificate Signing Request (CSR) is created from the public key and the domain name:

```bash
openssl req -new -newkey rsa:2048 -nodes -keyout bigtom.key -out bigtom.csr
```

When prompted for the *Common Name* (CN), the requested domain must be entered (e.g., `bigtom.biologie.thm.de`).

### Step 3 — Submit the CSR to the THM IT Department

The **CSR** (not the private key!) is submitted to the university computing center. The THM IT department signs the request either:

- via the university's internal root CA, or
- via the DFN-PKI/GÉANT trusted-certificate integration.

Both options have the advantage that their root certificate is already deposited as trusted on THM-managed machines — users therefore no longer see a browser warning.

### Step 4 — Integrate the Certificate

The certificate signed by the IT department (including chain/intermediate certificates, if applicable) is integrated into the production Nginx configuration together with the private key generated locally in Step 2. It replaces the local `bigtom-local.pem`/`bigtom-local-key.pem` files from the `mkcert` development setup:

```nginx
ssl_certificate     /etc/nginx/certs/bigtom.pem;       # officially signed certificate (+ chain)
ssl_certificate_key /etc/nginx/certs/bigtom.key;        # private key, exclusively on the server
```

Nothing else changes in the remaining Nginx configuration (reverse proxy, rate limiting, see Sections 4 and 5) as a result of the certificate change — only `ssl_certificate` and `ssl_certificate_key` need to point to the production file paths.

### Post-Deployment Validation Checklist

After integrating the production certificate, the following should be verified (analogous to the tests performed as part of the local setup):

| Check                                    | Command                                                             | Expected Result                                                                                           |
|-------------------------------------------|----------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| Nginx configuration syntactically correct | `nginx -t` (inside the container: `docker compose exec frontend nginx -t`) | `syntax is ok` / `test is successful`                                                                      |
| HTTP → HTTPS redirect                     | `curl -I http://<domain>`                                            | `301 Moved Permanently`, `Location: https://<domain>/`                                                     |
| HTTPS response without certificate warning | `curl -I https://<domain>`                                          | `200 OK`, **no** `--insecure`/`--ssl-no-revoke` flag needed (unlike the local `mkcert` setup)              |
| Backend proxying via `/api/`              | `curl -i https://<domain>/api/v1/status/not-a-real-job`              | `404 Not Found` with correct JSON payload from the backend                                                 |
| Certificate chain complete                | `openssl s_client -connect <domain>:443 -showcerts`                  | Certificate chain reaches the trusted root without gaps                                                    |

---

## 4. Nginx Reverse Proxy

### 4.1 Basic Configuration

Nginx runs inside the `frontend` container as an unprivileged process (nginxinc/nginx-unprivileged) and listens internally on ports 8080 (HTTP) and 8443 (HTTPS). Since the restriction on ports below 1024 (requiring root privileges) only applies to the process inside the container, the port mapping on the Docker host can be freely chosen. The Docker daemon forwards requests at the host level.

```yaml
frontend:
  build:
    context: .
    dockerfile: ./frontend/Dockerfile
  ports:
    - "80:8080"
    - "443:8443"
```

Through this mapping (80:8080 / 443:8443), the Nginx process inside the container remains fully unprivileged and continues to listen on the high ports. Binding to the standard web ports 80 and 443 occurs exclusively on the host system, performed by the Docker daemon.

Basic Nginx configuration (excerpt from `nginx.conf`):

```nginx
server {
    listen 8080;
    server_name localhost;
    return 301 https://$host:$server_port$request_uri;
}

server {
    listen 8443 ssl;
    server_name localhost;

    ssl_certificate     /etc/nginx/certs/bigtom-local.pem;
    ssl_certificate_key /etc/nginx/certs/bigtom-local-key.pem;

    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 1400M;
        proxy_read_timeout 500s;
        proxy_connect_timeout 300s;
    }
    # ... additional, route-specific /api/v1/* locations, see Section 5
}
```

**Note on `server_name localhost`:** For the production deployment, `server_name` must be changed to the actual THM domain (e.g., `bigtom.biologie.thm.de`).

### 4.2 Static Frontend

The `location /` block serves the built single-page application (`/usr/share/nginx/html`, see the multi-stage build in the frontend Dockerfile). `try_files $uri $uri/ /index.html` ensures that client-side routing (e.g., React Router) also works when a subpage is called directly (e.g., `/analysis/<job_id>`), by falling back to `index.html` for unknown paths.

### 4.3 Proxying to the Backend

All requests under `/api/*` are forwarded to the backend (`http://backend:8000`, internal Docker service name). Shared proxy headers are factored out into `proxy_params` and included by most route-specific locations via `include`:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
client_max_body_size 1400M;
proxy_read_timeout 500s;
proxy_connect_timeout 300s;
```

**Rationale for the values:**

- `client_max_body_size 1400M`: Uploads (IDAT files for methylation analysis) can be several hundred MB in size; the limit is deliberately generous but not unlimited.
- `proxy_read_timeout 500s` / `proxy_connect_timeout 300s`: Compute-intensive R analysis steps (DMP/DMR calculation, batch correction) can take several minutes; the default Nginx timeouts (60s) would cause premature connection aborts here.
- `X-Forwarded-Proto` / `X-Forwarded-For`: Allow the backend to identify the original client IP and the original protocol (HTTPS), even though the request is technically forwarded by Nginx internally over HTTP.

### 4.4 Error Handling on Rate-Limit Violations

When a rate limit is exceeded, Nginx directly returns a structured `429` response in [RFC 7807 Problem Details format](https://www.rfc-editor.org/rfc/rfc7807), consistent with the backend's error format:

```nginx
error_page 429 /429.json;
location = /429.json {
    default_type application/problem+json;
    return 429 '{"title":"Too Many Requests","status":429,"detail":"Rate limit exceeded. Please wait before retrying."}';
}
```

This means the frontend receives a response in the same format when rate-limited as it would for regular backend errors, without the backend ever seeing the request.

---

## 5. Rate-Limiting Concept

### 5.1 Goal

Protect the server from overload and (unintentional or malicious) DoS-like load through Nginx-based rate limiting at the reverse-proxy level. Requests are limited per client IP address. When exceeded, Nginx directly returns `429 Too Many Requests` — in this case the request never reaches the backend at all.

### 5.2 Base Assumptions

- **Number of users:** 1–5 concurrent users (internal THM application, no public mass access).
- **Status polling interval:** 3 seconds (frontend default, see `useJobPolling.ts`).
- **Burst:** A brief surplus of requests (e.g., due to a browser reload or rapid clicking) is not immediately blocked, but is absorbed via a defined burst buffer.

### 5.3 Rate-Limit Categories

Three categories serve as a rough guideline, from which the concrete zones were derived and fine-tuned per route:

| Category | Requests/min | Burst | Lockout time |
|----------|--------------|-------|---------------|
| Strict   | 5–10 / min   | 2–3   | ~60s          |
| Medium   | 20–30 / min  | 5–10  | ~30s          |
| Light    | 30–60 / min  | 5–15  | ~10s          |

Individual routes (upload, status polling, table export, batch processing) deliberately deviate from this, since their actual usage patterns cannot be cleanly squeezed into a rough three-tier scheme (see detailed rationale below).

### 5.4 Implemented Rate-Limit Zones (Nginx)

```nginx
limit_req_zone $binary_remote_addr zone=upload_zone:10m rate=6r/m;
limit_req_zone $binary_remote_addr zone=status_zone:10m rate=25r/m;
limit_req_zone $binary_remote_addr zone=light_zone:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=medium_zone:10m rate=20r/m;
limit_req_zone $binary_remote_addr zone=strict_zone:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=batch_zone:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=table_zone:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=export_zone:10m rate=10r/m;
limit_req_status 429;
```

Each zone limits requests per client IP (`$binary_remote_addr`) independently of the other zones; a `10m` shared-memory area is sufficient to track several tens of thousands of concurrent IP addresses, which is far more than sufficient for the expected user base (1–5 concurrent users).

### 5.5 Route Analysis and Mapping

#### Upload & Job Initialization

**`POST /api/v1/upload`** → `upload_zone` (6 req/min, `burst=3`, `nodelay`)

```nginx
location ~ ^/api/v1/upload(/|$) {
    limit_req zone=upload_zone burst=3 nodelay;
    proxy_pass http://backend:8000;
    include /etc/nginx/proxy_params;
}
```

- File upload is resource-intensive (files up to several hundred MB) and immediately triggers background processes (filtering, R script startup).
- Failed uploads and retries are realistic, but limited to a maximum of ~6 attempts/min per user.

#### Status & Polling

**`GET /api/v1/status/{job_id}`** → `status_zone` (25 req/min, `burst=10`, `nodelay`)

```nginx
location ~ ^/api/v1/status/ {
    limit_req zone=status_zone burst=10 nodelay;
    proxy_pass http://backend:8000;
    include /etc/nginx/proxy_params;
}
```

- Calculation basis: with a polling interval of 3 seconds, each user requires roughly 20 req/min. With up to 5 concurrent users, this would result in a combined demand of up to 100 req/min — however, the zone is applied **per IP**, so the chosen value of 25 req/min is based on a single user's demand with a small buffer.

#### Filter Statistics

**`GET /api/v1/filter/{job_id}/stats`** → `light_zone` (30 req/min, `burst=5`)

- Retrieved once after filtering, corresponding to a low expected frequency.

#### Normalization Preview

**`GET /api/v1/preview/normalization/{job_id}`** → `medium_zone` (20 req/min, `burst=5`)
**`GET /api/v1/preview/normalization/{job_id}/{plot_name}`** → `medium_zone` (20 req/min, `burst=10`)

- Multiple plot images (JSON for PCA plots and PNG for density plots) are loaded in parallel — one request per plot. The burst must therefore cover at least the number of concurrently loading plots (currently 5).

#### Normalization

**`POST /api/v1/normalize/{job_id}`** → `strict_zone` (5 req/min, `burst=2`, `nodelay`)

- Starts a compute-intensive R process; should only be executed a few times per analysis.

#### Batch Correction

| Route                                             | Zone                                      | Rationale                                                                 |
|-----------------------------------------------------|--------------------------------------------|-----------------------------------------------------------------------------|
| `GET /api/v1/batch/{job_id}/batch-options`          | `light_zone` (30/min, burst=5)             | One-time call when loading the batch page                                   |
| `GET /api/v1/batch/{job_id}/history`                | `light_zone` (30/min, burst=5)             | Reloaded after each batch iteration, low frequency                          |
| `GET /api/v1/batch/{job_id}/svd-plot/{round_id}`    | `light_zone` (30/min, burst=10)            | PNG/plot retrieval, several requests depending on number of rounds          |
| `POST /api/v1/batch/{job_id}`                       | `batch_zone` (10/min, burst=3, `nodelay`)  | Starts an R process, biologically reasonable max. 3–5 iterations per analysis |
| `POST /api/v1/batch/{job_id}/skip`                  | `strict_zone` (5/min, burst=2, `nodelay`)  | Should be executed rarely and deliberately                                  |

#### Table

| Route                                          | Zone                              | Rationale                                                                                                              |
|--------------------------------------------------|------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| `GET /api/v1/table/{job_id}/{table}`             | `table_zone` (30/min, burst=15)    | Called on filtering, sorting, and pagination; users may click rapidly in succession, hence the higher burst value        |
| `GET /api/v1/table/{job_id}/{table}/export`      | `export_zone` (10/min, burst=3)    | CSV export can serialize a large DataFrame; should not be repeated in rapid succession                                   |

#### Heatmap

| Route                                     | Zone                                        | Rationale                                                                                                                                       |
|----------------------------------------------|-----------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| `GET /api/v1/heatmap/{job_id}/options`       | `light_zone` (30/min, burst=5)                | One-time call when opening the heatmap section                                                                                                  |
| `POST /api/v1/heatmap/{job_id}`              | `strict_zone` (10/min, burst=3, `nodelay`)    | Starts an R script, can take a long time on large datasets; UI already disables buttons during a running analysis as an additional safeguard    |
| `GET /api/v1/heatmap/{job_id}`               | `medium_zone` (20/min, burst=5)               | Image retrieval after generation; a cache-buster prevents browser caching, meaning every fetch is a genuine request to the backend               |

#### Reset & Session

**`POST /api/v1/reset/{job_id}`** → `strict_zone` (5 req/min, `burst=2`, `nodelay`)

- Terminates running R processes; must run cleanly, duplicate/rapidly repeated clicks must be prevented.

### 5.6 Zone Overview

| Zone           | Rate        | Typical routes                                                     |
|----------------|-------------|----------------------------------------------------------------------|
| `strict_zone`  | 5 req/min   | Normalization, reset, heatmap start, batch skip                     |
| `medium_zone`  | 20 req/min  | Normalization preview, heatmap retrieval                            |
| `light_zone`   | 30 req/min  | Filter stats, batch options/history/SVD plot, heatmap options       |
| `upload_zone`  | 6 req/min   | File upload                                                          |
| `status_zone`  | 25 req/min  | Job status polling                                                   |
| `batch_zone`   | 10 req/min  | Batch correction execution                                           |
| `table_zone`   | 30 req/min  | Table retrieval (filter/sort/pagination)                            |
| `export_zone`  | 10 req/min  | CSV export                                                            |

### 5.7 Outlook

The current values are based on manually measured analysis times using a reference dataset (`data.zip`) and default parameters. If dataset sizes or user numbers deviate significantly, the zone values should be reviewed and adjusted as needed.