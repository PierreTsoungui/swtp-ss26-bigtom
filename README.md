
=======
# Methylome Analyzer

Webanwendung zur Analyse von DNA-Methylierungsdaten.  
Stack: **React** · **FastAPI** · **R** · **Docker**

---

## Lokale HTTPS-Entwicklung

Die Docker-Anwendung kann lokal ueber HTTPS laufen. TLS terminiert im bestehenden
Frontend-Nginx-Container; API-Aufrufe laufen im Browser relativ ueber `/api/`
und werden intern an `http://backend:8000` weitergeleitet.

Einmalig ein lokales mkcert-Zertifikat erzeugen:

```powershell
.\scripts\generate-dev-certificate.ps1
```

Container starten:

```powershell
docker compose up --build
```

HTTPS-Diagnose ausfuehren:

```powershell
.\scripts\diagnose-https.ps1
```

Wichtige lokale URLs:

| Was | URL |
|---|---|
| Anwendung | https://localhost |
| Upload | https://localhost/upload |
| API ueber Nginx | https://localhost/api/ |
| Backend Swagger direkt | http://localhost:8000/docs |

`http://localhost` leitet auf `https://localhost` weiter. Details,
LAN-IP-Zertifikate und Troubleshooting: [docs/HTTPS.md](docs/HTTPS.md).

---

## Voraussetzungen

- Docker + Docker Compose
- Git (SSH-Key für `magrathea.mni.thm.de`)

---

## Setup

### 1. Repository klonen

```bash
git clone git@magrathea.mni.thm.de:swtp-ss26-bigtom.git
cd swtp-ss26-bigtom
```

> Der Ordner heißt nach dem Klonen `swtp-ss26-bigtom`.

### 2. Alle Container bauen und starten

```bash
docker compose up --build
```

> Der erste Build des R-Containers dauert **~40–60 Minuten** – R-Libraries werden kompiliert und gecacht. Jeder weitere Start dauert nur Sekunden.

### 3. Anwendung öffnen

| Was | URL |
|---|---|
| Anwendung | https://localhost |
| Upload | https://localhost/upload |
| API (Swagger UI) | http://localhost:8000/docs |

---

## Upload-Workflow

Aktuell ist der Upload ueber **https://localhost/upload** verfuegbar.

Benötigt werden:
- Ein **Samplesheet** (`.csv`)
- Die zugehörigen **IDAT-Files** (je Sample eine `_Red.idat` und eine `_Grn.idat`)

Hochgeladene Dateien werden temporär unter `backend/app/temp/<job-id>/` abgelegt.

---

## Ports & Services

| Container | Port (Host) | Port (intern) | Beschreibung |
|---|---|---|---|
| `frontend` | `80`, `443` | `80`, `443` | React-App via nginx, HTTP-Redirect auf HTTPS |
| `backend` | `8000` | `8000` | FastAPI REST API |
| `r_worker` | – | – | R-Analyse, kein Port nach außen |

---

## Container-Übersicht

### Frontend (`./frontend`)
- Base Image: `node:20-alpine` → Build → `nginx:alpine`
- React/Vite-App wird gebaut und statisch über nginx ausgeliefert
- nginx ist über `nginx.conf` konfiguriert – SPA-Routing über `try_files` aktiviert
- Upload-Oberflaeche erreichbar unter: **https://localhost/upload**

### Backend (`./backend`)
- Base Image: `python:3.11-slim`
- FastAPI + Uvicorn, läuft auf Port `8000`
- Ruft den R Worker über Docker Socket (`docker exec`) auf
- Hochgeladene Dateien werden temporär unter `app/temp/<job-id>/` abgelegt
- Volumes: `./jobs`, `./r_backend`, Docker Socket (`/var/run/docker.sock`)
- Abhängigkeiten: `fastapi`, `uvicorn`, `python-multipart`, `pandas`, `openpyxl`, `pytest`, `httpx`

### R Worker (`./r_backend`)
- Base Image: `rocker/r-ver:4.4.1`
- Läuft dauerhaft im Hintergrund (`tail -f /dev/null`)
- Volumes: `./jobs`, `./r_backend`, `./data`
- Installierte Libraries: `minfi`, `limma`, `sva`, `DMRcate`, `bumphunter`, `ggplot2`, `ComplexHeatmap`, `data.table`, `tidyverse`, `readxl`, `logger`, `progressr`, EPICv2 Annotation (`IlluminaHumanMethylationEPICv2manifest`, `IlluminaHumanMethylationEPICv2anno.20a1.hg38`)

---

## Projektstruktur

```
swtp-ss26-bigtom/
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── app/
│       └── src/
│           ├── features/
│           │   └── upload/        # Upload-Feature (IDAT + Samplesheet)
│           └── main.tsx
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py
│   │   ├── api/routes/            # upload.py, status.py
│   │   ├── models/                # job.py
│   │   ├── services/              # file_handler.py, job_manager.py, r_executor.py
│   │   └── temp/                  # temporäre Upload-Daten pro Job-ID (gitignored)
│   └── tests/
│       └── test_upload.py
├── r_backend/
│   └── Dockerfile
├── jobs/                          # persistente Job-Daten (gitignored)
├── data/                          # Demo-Daten (EPICv2, 4 Samples)
└── docker-compose.yml
```

---

## Häufige Befehle

### Starten & Stoppen

```bash
# Starten (mit Rebuild):
docker compose up --build

# Starten ohne Rebuild (schneller):
docker compose up

# Im Hintergrund starten:
docker compose up -d

# Stoppen:
docker compose down
```

### Einzelne Container neu bauen

```bash
# Nur R-Worker neu bauen (z.B. nach Dockerfile-Änderung):
docker compose build --no-cache r_worker

# Nur Backend neu bauen:
docker compose build --no-cache backend

# Nur Frontend neu bauen:
docker compose build --no-cache frontend
```

### Einzelne Container neu starten

```bash
docker compose restart backend
docker compose restart frontend
docker compose restart r_worker
```

---

## In Container einloggen

### R Worker – interaktive R-Session

```bash
docker compose run --rm r_worker R
```

Direkt in die Bash:

```bash
docker compose run --rm r_worker bash
```

### Backend

```bash
docker compose exec backend bash
```

### Frontend (nginx)

```bash
docker compose exec frontend sh
```

---

## Dateien & Ordner im Container inspizieren

```bash
# Jobs-Ordner inspizieren:
docker compose exec backend ls /app/jobs/

# Im R Worker nachschauen:
docker compose exec r_worker ls /app/r_backend/
```

> Containernamen folgen dem Schema `<projektordner>-<service>-1`.  
> Projektordner = `swtp-ss26-bigtom` → Container heißt z.B. `swtp-ss26-bigtom-backend-1`  
> Die tatsächlichen Namen können mit `docker compose ps` geprüft werden.

---

## Logs ansehen

```bash
# Alle Container gleichzeitig:
docker compose logs -f

# Einzelner Service:
docker compose logs -f backend
docker compose logs -f r_worker
docker compose logs -f frontend

# Nur die letzten 50 Zeilen:
docker compose logs --tail=50 backend
```

---

## Häufige Fehler

### Port bereits belegt

```bash
# Welcher Prozess nutzt Port 80, 443 oder 8000?
sudo ss -tlnp | grep :443
sudo lsof -i :8000

# Lösung A – laufende Container stoppen:
docker compose down

# Lösung B – Port in docker-compose.yml anpassen:
# "80:80" -> "8080:80" oder "443:443" -> "8443:443"
# Achtung: Nicht ins Repository pushen – einheitliches Setup beibehalten
```

### R-Container startet nicht / Build schlägt fehl

```bash
docker compose logs r_worker
docker compose build --no-cache r_worker
```

### Backend findet R Worker nicht

```bash
# Läuft der r_worker?
docker ps | grep r_worker

# Docker Socket korrekt gemountet?
# In docker-compose.yml unter backend > volumes muss stehen:
# - /var/run/docker.sock:/var/run/docker.sock
```

### Änderungen werden nicht übernommen

```bash
# Mit Cache neu bauen:
docker compose up --build

# Komplett ohne Cache neu bauen:
docker compose build --no-cache
docker compose up
```

### `version`-Warning bei docker compose

Die Zeile `version: '3.8'` in `docker-compose.yml` ist veraltet und kann entfernt werden. Die Anwendung funktioniert trotzdem.

### Shell nicht verfügbar

Der `r_worker`-Container hat Bash. Falls ein Problem auftritt:

```bash
docker compose exec r_worker sh
```
---

Team BigTom · Technische Hochschule Mittelhessen (THM)
