# Security Architecture: Backend

**Scope:** `backend/` — the FastAPI service that accepts uploads, orchestrates the analysis pipeline, and serves results. This document describes the controls that protect the service against untrusted input and the deliberate, documented risks that remain.
**Audience:** Backend-Dev, Reviewer, DevOps — engineers maintaining or extending the backend, reviewers auditing the upload and execution paths, and operators deploying the service.
**Status:** Stable
**Last reviewed:** 2026-07-09

---

## Table of Contents

- [1. Overview & Threat Model](#1-overview--threat-model)
- [2. Trust Boundaries & Data Flow](#2-trust-boundaries--data-flow)
- [3. Path-Traversal Protection](#3-path-traversal-protection)
- [4. Safe Archive Extraction](#4-safe-archive-extraction)
- [5. File Validation](#5-file-validation)
- [6. Two-Phase Upload (inspect → commit)](#6-two-phase-upload-inspect--commit)
- [7. Central Limits & Allow-Lists](#7-central-limits--allow-lists)
- [8. Process Execution & the Docker Socket](#8-process-execution--the-docker-socket)
- [9. CORS Policy](#9-cors-policy)
- [10. Transport Security & Security Headers](#10-transport-security--security-headers)
  - [10.1 Application-layer headers](#101-application-layer-headers)
  - [10.2 Proxy-layer headers (Nginx)](#102-proxy-layer-headers-nginx)
- [11. Data Protection (GDPR)](#11-data-protection-gdpr)
- [12. Security Testing](#12-security-testing)
- [13. Production Hardening Checklist](#13-production-hardening-checklist)

---

## 1. Overview & Threat Model

The backend processes files that are, by definition, untrusted: a user uploads raw IDAT files, a sample sheet, and optionally a ZIP archive. The primary attack surface is therefore the **upload path**, and the primary risks are:

| Threat | Vector | Primary control |
|---|---|---|
| Path traversal / arbitrary file write | crafted filenames, client-supplied ids | server-generated UUIDs + basename flattening + containment checks ([§3](#3-path-traversal-protection)) |
| Zip-Slip (write outside target) | `..`/absolute paths in a ZIP member | `safe_extract_zip` member resolution ([§4](#4-safe-archive-extraction)) |
| Zip-bomb (resource exhaustion) | high compression ratio / oversized archive | count/size/ratio caps, streamed extraction ([§4](#4-safe-archive-extraction)) |
| Malicious/malformed content | file masquerading as IDAT/CSV | magic-byte + extension + size validation ([§5](#5-file-validation)) |
| Premature/partial persistence | interrupted or invalid upload | two-phase inspect → commit with rollback ([§6](#6-two-phase-upload-inspect--commit)) |
| Cross-origin abuse | browser-driven requests | CORS allow-list ([§9](#9-cors-policy)) |
| Host compromise via container | Docker socket access | documented residual risk + hardening guidance ([§8](#8-process-execution--the-docker-socket)) |

**Design assumptions.** The application has **no user accounts and no authentication**. Access control relies on network placement (the deployment is intended for an internal, trusted network) and on the fact that job and session identifiers are unguessable UUIDs. A job UUID therefore acts as a **bearer capability**: any party that possesses it can read that job's results. This is acceptable for the intended internal deployment; see [§13](#13-production-hardening-checklist) for public-deployment considerations.

Uploaded files are treated strictly as **data**. They are never executed, never interpreted as code, and are written without an execute bit.

---

## 2. Trust Boundaries & Data Flow

```
   Browser ──HTTPS(443)──► Nginx (frontend) ──HTTP──► FastAPI backend (:8000)
   (untrusted)              TLS termination           │
                                                      │ 1. inspect  → staging/<session-uuid>/   (quarantine)
                                                      │ 2. commit   → jobs/<job-uuid>/          (confirmed)
                                                      │
                                                      └─ docker exec ─► r_worker container (R scripts)
```

Two boundaries matter:

1. **Browser → backend.** Everything from the browser is untrusted. TLS terminates at the Nginx frontend container ([§10](#10-transport-security--security-headers)); the backend speaks plain HTTP only on the private Docker network.
2. **Backend → R worker.** The backend invokes R scripts in a separate container via the Docker socket ([§8](#8-process-execution--the-docker-socket)).

Untrusted data is quarantined in `staging/` during inspection and only promoted to `jobs/` after explicit user confirmation and validation ([§6](#6-two-phase-upload-inspect--commit)).

---

## 3. Path-Traversal Protection

Three kinds of identifier feed into filesystem paths — **job ids**, **session ids**, and the **filenames** inside an upload. Each is handled so that untrusted input cannot escape its target directory.

### 3.1 Identifiers are server-generated, never client-supplied

Job ids and staging session ids are generated server-side with `uuid.uuid4()` (`api/routes/upload.py`, `services/staging_manager.py`). The job directory is derived as `JOB_BASE_DIR / job_id`; because `job_id` is a fresh UUID, the client cannot influence this path at all. The same UUID is reused as the container path `/app/jobs/{job_id}` for the R worker ([`r-executor.md`](../architecture/r-executor.md)), so there is no traversal or injection surface there either.

### 3.2 Client-supplied session ids are strictly validated

On `commit`, `preview`, and `delete`, the client sends a `session_id`. `staging_manager._resolve_session_dir()` applies two independent checks before the id ever reaches the filesystem:

```python
uuid.UUID(session_id)                       # 1. must parse as a UUID (rejects "..", paths, etc.)
session_dir = (base / session_id).resolve()
if not session_dir.is_relative_to(base):    # 2. resolved path must stay inside the staging base
    raise AppException(ErrorTypes.SESSION_NOT_FOUND, ...)
```

Anything that is not a valid UUID, or that would resolve outside the staging base, is rejected as `SESSION_NOT_FOUND`.

### 3.3 Filenames are flattened to a basename and contained

Filenames inside an upload are never trusted as paths:

- **Sample sheet** — `save_sample_sheet()` ignores the client filename entirely and always writes the canonical `SampleSheet.csv`, with an additional `resolve().relative_to(job_dir)` containment check. In the folder/ZIP path the sheet is likewise re-serialised to a canonical CSV.
- **IDAT files** — `save_idat_files()` reduces every filename to its basename (`Path(filename).name`), stripping any directory components, and rejects duplicate basenames rather than overwriting.
- **Commit move** — before moving a staged file into the job directory, `_move_idats()` / `_build_canonical_sheet()` re-resolve the source path and assert `is_relative_to(session_dir)` and `is_file()`, so a manipulated manifest cannot reference a file outside the session.

### 3.4 Guarantees

- No client input reaches a filesystem path without either being replaced by a server UUID/constant or passing a resolve-and-contain check.
- A crafted filename such as `../../etc/passwd` cannot escape the target directory; for the sample sheet it is discarded in favour of the canonical name.

**Tests:** [`tests/test_path_traversal_dateikollission.py`](../../backend/tests/test_path_traversal_dateikollission.py) pins the sample-sheet name sanitisation (`../../etc/passwd` → `SampleSheet.csv`), the IDAT basename handling, and the duplicate-filename rejection.

---

## 4. Safe Archive Extraction

`services/archive_utils.py` is the **only** place in the codebase that opens a ZIP. Extracting a user-supplied archive is the single most dangerous upload operation, so every defence is concentrated behind one function, `safe_extract_zip()`. Extraction is always member-by-member and streamed — never a blind `extractall()`.

| Threat | Control | Location |
|---|---|---|
| **Zip-Slip** | Each member name is normalised; absolute paths, Windows drive letters and `..` components are rejected, and the resolved target must satisfy `is_relative_to(dest_root)`. Two independent checks (component inspection + final containment) provide defence in depth. | `_safe_target()` |
| **Zip-bomb (declared)** | Up-front envelope check from the central directory: member count ≤ `MAX_ARCHIVE_FILE_COUNT`, declared uncompressed total ≤ `MAX_UNPACKED_TOTAL_BYTES`, and compression ratio ≤ `MAX_COMPRESSION_RATIO` (only enforced above `COMPRESSION_RATIO_MIN_BYTES`, so a tiny compressible text file does not trip it). | `_check_archive_envelope()` |
| **Zip-bomb (actual)** | Each member is streamed in 1 MiB chunks, counting *actual* bytes written; the per-file cap `MAX_SINGLE_FILE_BYTES` and the running unpacked total are enforced during the copy, so a lying header cannot smuggle a large file past the guard. | `_extract_member()` / `safe_extract_zip()` |
| **Symlinks / special entries** | Directory entries and symlinks are dropped (`stat.S_ISLNK`), so a link can never be followed onto a host path. | `_is_junk()` |
| **Member-type allow-list** | Only `.idat/.csv/.xls/.xlsx` members are written to disk. Other real files are reported by name (`skipped_unsupported`) but never extracted; OS junk (`__MACOSX/`, `.DS_Store`, hidden dotfiles) is dropped silently. | `safe_extract_zip()` / `_is_junk()` |
| **Inert output** | Every written file is `chmod 0o644` (no execute bit), as defence in depth. | `_extract_member()` |

A rejected archive raises `ArchiveError(code, message)`; the caller discards the staging directory. The `code` maps to an RFC-9457 HTTP error type.

**Tests:** [`tests/test_archive_utils.py`](../../backend/tests/test_archive_utils.py) covers the extension whitelist, Zip-Slip and absolute-path rejection, corrupt archives, `__MACOSX`/dotfile dropping, the file-count cap, the single-file size cap, the compression-ratio bomb, and the empty/only-unsupported case.

---

## 5. File Validation

Validation combines **extension**, **magic bytes**, and **size**, so a file cannot pass merely by carrying the right extension (`services/file_handler.py`).

### 5.1 IDAT files

- Extension must be `.idat`.
- `looks_like_idat()` performs a low-risk plausibility check on the first 2 KB: reject files under 100 bytes, reject a `%PDF` header, and require at least 10 NUL bytes (IDAT is a binary format).
- The count must be **even** (IDAT files come in Red/Green pairs).
- The combined size must not exceed the total-size limit.

This is a deliberate plausibility check rather than a full IDAT parser: the goal is to reject obvious fakes without rejecting valid data. Structural validity is confirmed later by the R backend, which fails cleanly on a malformed IDAT.

### 5.2 Sample sheet

- Extension must be `.csv`, `.xls`, or `.xlsx`.
- Magic bytes are checked per type:
  - `.xlsx` → `PK\x03\x04` (ZIP/OOXML container),
  - `.xls` → `\xD0\xCF\x11\xE0` (OLE compound file),
  - `.csv` → reject a `%PDF` header and require at least one plausible delimiter (`,`, `;`, tab, newline).
- Size must not exceed `MAX_SAMPLE_SHEET_BYTES`.

### 5.3 Enforcement in the folder/ZIP path

For the two-phase upload, the inspect service streams every part to disk with the central per-file and per-request caps (`_stream_to_file`, `_check_total`), aborting and deleting the partial file the moment a cap is exceeded. Only whitelisted extensions are staged; everything else is recorded as `skipped`.

---

## 6. Two-Phase Upload (inspect → commit)

The folder/ZIP upload (UPL-01) is intentionally split into two phases. This is both a usability and a **security/robustness** measure: nothing enters `jobs/` until the user has explicitly confirmed a validated selection.

**Phase 1 — `POST /upload/inspect`.** The upload is streamed into a fresh `staging/<session-uuid>/` directory. ZIPs are extracted with `safe_extract_zip` ([§4](#4-safe-archive-extraction)); loose files are validated and de-duplicated. The service classifies the staged content into IDAT pairs and candidate sample sheets and returns a manifest. **No job directory is created.** A lazy `GET /upload/{session_id}/preview` renders a tabular preview of a staged sheet on demand.

**Phase 2 — `POST /upload/commit`.** The client confirms a specific selection (pairs, sample sheet, column mapping). `persist_committed_job()` then, in order:

1. resolves the session and re-validates every selected path against the staging directory ([§3.3](#33-filenames-are-flattened-to-a-basename-and-contained));
2. validates the column mapping against the sheet **before** touching the job directory (mapped columns must exist; the mapped chip columns must match at least one selected IDAT pair);
3. creates a fresh `jobs/<job-uuid>/`, moves only the confirmed files in, writes the canonical `SampleSheet.csv` and the filter settings;
4. on **any** error, rolls back the partial job directory (`clean_job_files`) so a failed commit never leaves a half-built job behind;
5. deletes the staging session on success.

`DELETE /upload/{session_id}` lets the user discard a session explicitly; unconfirmed sessions also expire automatically ([§11](#11-data-protection-gdpr)).

**Security value.** Untrusted, unverified data is confined to `staging/` and is promoted to `jobs/` only as an explicit, validated, all-or-nothing operation. Extraction and validation failures are contained in the quarantine area and cleaned up.

---

## 7. Central Limits & Allow-Lists

The size/count limits and extension allow-lists for the folder/ZIP flow live in exactly one module, `core/upload_limits.py`, so the security envelope cannot drift between the archive, inspect, and commit code paths.

| Constant | Value | Purpose |
|---|---|---|
| `MAX_UPLOAD_REQUEST_BYTES` | 1 GB | total bytes accepted in one inspect call |
| `MAX_UNPACKED_TOTAL_BYTES` | 2 GB | total size after unpacking a ZIP |
| `MAX_SINGLE_FILE_BYTES` | 100 MB | cap for any single extracted/staged file |
| `MAX_SAMPLE_SHEET_BYTES` | 10 MB | sample-sheet size cap |
| `MAX_ARCHIVE_FILE_COUNT` | 2000 | member-count cap (~1000 IDAT pairs) |
| `MAX_COMPRESSION_RATIO` | 50 | zip-bomb ratio guard |
| `COMPRESSION_RATIO_MIN_BYTES` | 10 MB | payload size above which the ratio guard applies |
| `ALLOWED_IDAT_EXTENSIONS` | `.idat` | IDAT allow-list |
| `ALLOWED_SHEET_EXTENSIONS` | `.csv`, `.xls`, `.xlsx` | sample-sheet allow-list |

> **Note.** The deprecated single-shot `POST /upload` route uses its own constants in `file_handler.py` (a legacy code path). New work should rely on the two-phase flow and the central `upload_limits.py`. Consolidating the legacy constants is recommended (see [§13](#13-production-hardening-checklist)).

---

## 8. Process Execution & the Docker Socket

The backend runs R analysis by invoking `docker exec` on the sibling `r_worker` container. To do so, the host Docker socket (`/var/run/docker.sock`) is mounted into the backend container. The Compose service, volume and mount configuration is documented in [`deployment/docker.md`](../deployment/docker.md); this section covers only the security implications.

### 8.1 Injection surface

Commands are constructed as an explicit **argument vector** and executed with `asyncio.create_subprocess_exec(*cmd)` — never through a shell and never with `shell=True` (`services/r_executor/`). The only interpolated value in a command path is the **server-generated job UUID** (`/app/jobs/{job_id}`), not any user-controlled string. There is therefore no shell-injection or path-injection surface through uploaded data.

### 8.2 Residual risk: the Docker socket is root-equivalent

Mounting `docker.sock` grants the backend container full control of the host Docker daemon, which is **equivalent to root on the host**. This is a **deliberate, documented trade-off** that keeps the local/compose deployment simple. It is acceptable only because the deployment is intended for a trusted, internal network and the backend does not execute uploaded content.

**Hardening options for a less-trusted deployment:**
- replace the raw socket mount with a **Docker socket proxy** that permits only `exec` on the specific worker container;
- run the R worker behind a small **internal RPC/queue** the backend calls, instead of granting Docker access;
- use **rootless Docker** or a dedicated, unprivileged runtime;
- constrain the worker further (it currently runs with `seccomp:unconfined`, relaxed to accommodate some Bioconductor operations; tighten where possible).

---

## 9. CORS Policy

CORS is configured in `main.py` using the `CORS_ALLOWED_ORIGINS` config variable (see [configuration.md](./configuration.md)):

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,   # env-configurable; defaults to localhost only
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization", "Origin"],
)
```

Origins are an explicit **allow-list** (no wildcard), scoped by default to local development and the local HTTPS setup. Methods and headers are an explicit allow-list restricted to what the API actually uses.

**Production hardening.** Set `CORS_ALLOWED_ORIGINS` to the exact production origin(s) (e.g. `https://app.example.com`). Because the application does not use cookies or credentialed requests today, `allow_credentials=True` is not currently required; if it is kept, confirm no wildcard origin is introduced, as the CORS specification forbids combining the two.

---

## 10. Transport Security & Security Headers

TLS is terminated at the **Nginx frontend container**, which serves the React application and reverse-proxies `/api/` to the backend over the private Docker network (`http://backend:8000`). The backend itself speaks plain HTTP inside Docker and holds no TLS material. See [`HTTPS.md`](../HTTPS.md) for the certificate and proxy setup.

### 10.1 Application-layer headers

The backend adds two response headers unconditionally via FastAPI middleware (`main.py`):

| Header | Value | Purpose |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing on served artifacts (PNG/PDF/CSV). |
| `Cross-Origin-Resource-Policy` | `same-origin` | Restricts cross-origin reads of served resources to the same origin. |

### 10.2 Proxy-layer headers (Nginx)

Headers that require TLS to be meaningful, or that cover the HTML/JS surface, belong at the Nginx layer rather than in the FastAPI application. For a production deployment, configure at minimum:

- `Strict-Transport-Security` (HSTS),
- `Content-Security-Policy`,
- `Referrer-Policy`,
- `X-Frame-Options` / CSP `frame-ancestors`.

The current Nginx setup is development-focused (local `mkcert` certificates); these headers are a deployment task tracked against the reverse proxy.

---

## 11. Data Protection (GDPR)

Uploaded data may constitute health data under Art. 9 GDPR. From a security standpoint the relevant property is a **bounded exposure window**: sensitive data exists on disk only for as long as an analysis needs it, and is then removed automatically.

The security-relevant guarantees are:

- **No permanent storage.** Files live only in per-job working directories under `jobs/` (and transiently in `staging/`). There is no database; results are not archived or backed up.
- **Automatic deletion.** Job data is deleted after a retention period (default **24 h**), and unconfirmed staging sessions expire after a period of **inactivity** (default **2 h**, configurable via `STAGING_RETENTION_HOURS`). The staging TTL uses a **sliding window**: every request that accesses the session (`preview`, `commit`) resets the expiry clock, so a user actively reviewing the inspect result is not interrupted. Abandoned sessions with no activity for the full retention window are removed by the cleanup loop.
- **Immediate deletion on demand.** Resetting a job (`POST /reset/{job_id}`) cancels any running work and deletes its data at once; `DELETE /upload/{session_id}` discards a staging session immediately.
- **Isolation.** Each analysis runs in its own job directory; data from one job is not exposed to another through the application.

The deletion *mechanism* (the two cleanup loops, mtime-based expiry, and reset teardown) is specified in [`architecture/job-lifecycle.md`](../architecture/job-lifecycle.md), and the exact retention values and their configuration in [`backend/configuration.md`](./configuration.md). These controls back the user-facing statement in the frontend [`PrivacyPolicyPage.tsx`](../../frontend/app/src/shared/pages/PrivacyPolicyPage.tsx); any change to retention behaviour must keep that page accurate.

---

## 12. Security Testing

Security-relevant behaviour is pinned by automated tests so that a regression fails the suite:

| Area | Test file | What it verifies |
|---|---|---|
| Path traversal & filename collisions | [`test_path_traversal_dateikollission.py`](../../backend/tests/test_path_traversal_dateikollission.py) | sample-sheet name sanitisation, IDAT basename handling, duplicate rejection |
| Safe archive extraction | [`test_archive_utils.py`](../../backend/tests/test_archive_utils.py) | Zip-Slip, absolute paths, corrupt archive, junk dropping, count/size/ratio caps, extension whitelist |
| Two-phase upload | [`test_upload_inspect_commit.py`](../../backend/tests/test_upload_inspect_commit.py) | inspect → commit flow, selection validation, rollback |
| Upload validation | [`test_upload.py`](../../backend/tests/test_upload.py) | extension/magic-byte/size validation and error mapping |

---

## 13. Production Hardening Checklist

The controls above are appropriate for the intended internal deployment. Before exposing the service more widely, review:

- [ ] **Authentication/authorization** — add real auth; today a job UUID is a bearer capability and there are no user accounts.
- [ ] **Docker socket** — replace the raw `docker.sock` mount with a restricted socket proxy, an internal RPC to the worker, or rootless Docker ([§8](#8-process-execution--the-docker-socket)).
- [ ] **CORS** — set the exact production origin(s); narrow methods/headers; drop `allow_credentials` unless credentials are actually used ([§9](#9-cors-policy)).
- [ ] **Security headers** — configure HSTS/CSP/`nosniff`/etc. at the Nginx layer ([§10](#10-transport-security--security-headers)).
- [ ] **Worker sandboxing** — tighten `seccomp` for the R worker where Bioconductor allows.
- [ ] **Limit consolidation** — migrate the deprecated single-shot `/upload` route off its local constants onto `core/upload_limits.py`, or remove the route ([§7](#7-central-limits--allow-lists)).
- [ ] **Request-rate limiting** — add rate limiting / body-size limits at the proxy to complement the application-level upload caps.
```
