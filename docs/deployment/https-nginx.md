# HTTPS, Reverse Proxy & Rate Limiting

Dieses Dokument beschreibt die HTTPS-/TLS-Konfiguration, den Nginx-Reverse-Proxy und das Rate-Limiting-Konzept der Anwendung. Es richtet sich sowohl an das Entwicklungsteam als auch an die **THM IT-Abteilung**, die das produktive Deployment im THM-Netzwerk übernimmt.

> **Wichtiger Hinweis zum Scope:** Dieses Projekt wird **nicht** von uns selbst produktiv deployt. Dieses Dokument bereitet das Deployment vor und beschreibt die notwendigen Schritte, die von der THM IT-Abteilung ausgeführt werden müssen, insbesondere die Ausstellung eines offiziell signierten TLS-Zertifikats.

---

## 1. Überblick über die Architektur

TLS terminiert zentral im `frontend`-Container (Nginx). Nginx übernimmt drei Aufgaben:

1. **HTTPS-Terminierung** – Verschlüsselung zwischen Client (Browser) und Server.
2. **Reverse Proxy** – Weiterleitung von `/api/*`-Anfragen an das `backend` (FastAPI/Uvicorn), das intern ausschließlich über HTTP erreichbar ist.
3. **Rate Limiting** – Schutz des Backends vor Überlastung durch IP-basierte Anfragebegrenzung, direkt auf Reverse-Proxy-Ebene, bevor eine Anfrage das Backend überhaupt erreicht.

```
Browser (HTTPS) → Nginx (TLS-Terminierung, Rate Limiting) → Backend (HTTP, intern)
```

Das Backend selbst spricht zu keinem Zeitpunkt TLS – es ist ausschließlich über das interne Docker-Netzwerk erreichbar und verlässt sich auf Nginx als einzigen, extern erreichbaren Einstiegspunkt.

---

## 2. Aktueller Stand: Lokales Entwicklungs-Setup (mkcert)

Für die lokale Entwicklung wird aktuell ein selbstsigniertes Zertifikat über [`mkcert`](https://github.com/FiloSottile/mkcert) erzeugt (siehe `HTTPS.md` im Repository für die detaillierte Anleitung). Dabei installiert `mkcert` eine lokal generierte Root-CA im Zertifikatsspeicher des jeweiligen Entwicklerrechners, wodurch der Browser dem Zertifikat vertraut, ohne eine Warnung anzuzeigen.

Die erzeugten Dateien (`bigtom-local.pem`, `bigtom-local-key.pem`) werden bewusst **nicht** versioniert (`.gitignore`) und müssen von jeder Entwicklerin/jedem Entwickler lokal selbst erzeugt werden. Ohne diese Dateien schlägt der Start des `frontend`-Containers mit einem Nginx-Zertifikatsfehler fehl.

### Warum dieses Setup nicht für die Produktion geeignet ist

Der zugrunde liegende Mechanismus von `mkcert` – eine lokal generierte Root-CA, die nur auf dem jeweiligen Entwicklerrechner als vertrauenswürdig hinterlegt ist – funktioniert ausschließlich, weil diese CA manuell in den Zertifikatsspeicher **eines einzelnen Rechners** installiert wurde. Sobald die Anwendung auf einem zentralen Server im THM-Netzwerk gehostet wird, auf den mehrere, IT-technisch nicht versierte Nutzer:innen (z. B. Biolog:innen im Labor) zugreifen sollen, funktioniert dieses Modell nicht mehr:

1. Der Browser eines externen Rechners kennt die `mkcert`-Root-CA nicht.
2. Der Browser zeigt die Sicherheitswarnung `ERR_CERT_AUTHORITY_INVALID`.
3. Die einzige Abhilfe wäre, die geheime `mkcert`-Root-CA manuell auf jedem Rechner zu installieren, der die Anwendung nutzen soll – dies ist in der Praxis nicht skalierbar und zudem sicherheitstechnisch bedenklich, da die Root-CA jedes Entwicklerrechners dann systemweites Vertrauen für beliebige, von diesem Rechner signierte Zertifikate genießen würde.

Für das produktive Deployment im THM-Netzwerk wird daher ein **von der Hochschule offiziell signiertes Zertifikat** benötigt, das auf THM-verwalteten Rechnern standardmäßig vertraut wird.

---

## 3. Produktions-Deployment: Anleitung für die THM IT-Abteilung

Die folgenden Schritte beschreiben den Prozess zur Ausstellung und Einbindung eines offiziellen TLS-Zertifikats für das produktive Deployment. Diese Schritte werden **von der THM IT-Abteilung** durchgeführt bzw. koordiniert, nicht vom Entwicklungsteam.

### Schritt 1 — Domain beantragen

Eine feste, interne Domain im THM-Netz beantragen, unter der die Anwendung erreichbar sein wird, z. B.:

```
bigtom.biologie.thm.de
```

### Schritt 2 — Schlüsselpaar und CSR erzeugen

Direkt **auf dem Zielserver** ein neues Schlüsselpaar generieren. Der private Schlüssel verbleibt ausschließlich auf dem Server und wird zu keinem Zeitpunkt weitergegeben oder in Versionskontrolle aufgenommen. Aus dem öffentlichen Schlüssel und dem Domainnamen wird ein Certificate Signing Request (CSR) erstellt:

```bash
openssl req -new -newkey rsa:2048 -nodes -keyout bigtom.key -out bigtom.csr
```

Bei der Eingabeaufforderung für den *Common Name* (CN) muss die beantragte Domain angegeben werden (z. B. `bigtom.biologie.thm.de`).

### Schritt 3 — CSR bei der THM-IT einreichen

Der **CSR** (nicht der private Schlüssel!) wird beim Hochschulrechenzentrum eingereicht. Die THM-IT signiert den Antrag entweder:

- über die hochschulinterne Root-CA, oder
- über die DFN-PKI-/GÉANT-Trusted-Certificate-Anbindung.

Beide Varianten haben den Vorteil, dass ihr Root-Zertifikat auf THM-verwalteten Rechnern bereits als vertrauenswürdig hinterlegt ist – Nutzer:innen sehen dadurch keine Browserwarnung mehr.

### Schritt 4 — Zertifikat einbinden

Das von der IT signierte Zertifikat (ggf. inklusive Chain-/Intermediate-Zertifikaten) wird zusammen mit dem in Schritt 2 lokal erzeugten privaten Schlüssel in die Produktions-Nginx-Konfiguration eingebunden. Es ersetzt dort die lokalen `bigtom-local.pem`/`bigtom-local-key.pem`-Dateien aus dem `mkcert`-Entwicklungssetup:

```nginx
ssl_certificate     /etc/nginx/certs/bigtom.pem;       # offiziell signiertes Zertifikat (+ Chain)
ssl_certificate_key /etc/nginx/certs/bigtom.key;        # privater Schlüssel, ausschließlich auf dem Server
```

An der übrigen Nginx-Konfiguration (Reverse Proxy, Rate Limiting, siehe Abschnitt 4 und 5) ändert sich durch den Zertifikatswechsel nichts – ausschließlich `ssl_certificate` und `ssl_certificate_key` müssen auf die produktiven Dateipfade zeigen.

### Validierungs-Checkliste nach dem Deployment

Nach der Einbindung des produktiven Zertifikats sollte Folgendes geprüft werden (analog zu den Tests, die im Rahmen des lokalen Setups durchgeführt wurden):

| Prüfung                                 | Befehl                                                             | Erwartetes Ergebnis                                                                                      |
|-----------------------------------------|--------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Nginx-Konfiguration syntaktisch korrekt | `nginx -t` (im Container: `docker compose exec frontend nginx -t`) | `syntax is ok` / `test is successful`                                                                    |
| HTTP → HTTPS Redirect                   | `curl -I http://<domain>`                                          | `301 Moved Permanently`, `Location: https://<domain>/`                                                   |
| HTTPS-Antwort ohne Zertifikatswarnung   | `curl -I https://<domain>`                                         | `200 OK`, **kein** `--insecure`/`--ssl-no-revoke`-Flag nötig (im Unterschied zum lokalen `mkcert`-Setup) |
| Backend-Proxying über `/api/`           | `curl -i https://<domain>/api/v1/status/not-a-real-job`            | `404 Not Found` mit korrektem JSON-Payload vom Backend                                                   |
| Zertifikatskette vollständig            | `openssl s_client -connect <domain>:443 -showcerts`                | Zertifikatskette bis zur vertrauenswürdigen Root reicht ohne Lücken                                      |

---

## 4. Nginx Reverse Proxy

### 4.1 Grundkonfiguration

Nginx läuft im `frontend`-Container als nicht-privilegierter Prozess (nginxinc/nginx-unprivileged) und lauscht intern auf den Ports 8080 (HTTP) und 8443 (HTTPS). Da die Beschränkung für Ports unter 1024 (Root-Rechte erforderlich) nur für den Prozess innerhalb des Containers gilt, kann das Port-Mapping im Docker-Host frei gewählt werden. Der Docker-Daemon leitet die Anfragen auf Host-Ebene weiter.

```yaml
frontend:
  build:
    context: .
    dockerfile: ./frontend/Dockerfile
  ports:
    - "80:8080"
    - "443:8443"
```


Durch dieses Mapping (80:8080 / 443:8443) bleibt der Nginx-Prozess im Container vollständig unprivilegiert und lauscht weiter auf den hohen Ports. Die Bindung an die Standard-Webports 80 und 443 erfolgt ausschließlich auf dem Host-System durch den Docker-Daemon.


 Grundlegende Nginx-Konfiguration (Auszug aus `nginx.conf`):
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
    # ... weitere, spezifische /api/v1/*-Routen, siehe Abschnitt 5
}
```

**Anmerkung `server_name localhost`:** Für das produktive Deployment muss `server_name` auf die tatsächliche THM-Domain (z. B. `bigtom.biologie.thm.de`) angepasst werden.

### 4.2 Statisches Frontend

Der `location /`-Block liefert die gebaute Single-Page-Application aus (`/usr/share/nginx/html`, siehe Multi-Stage-Build im Frontend-Dockerfile). `try_files $uri $uri/ /index.html` stellt sicher, dass Client-seitiges Routing (z. B. React Router) auch bei direktem Aufruf einer Unterseite (z. B. `/analysis/<job_id>`) funktioniert, indem unbekannte Pfade auf `index.html` zurückfallen.

### 4.3 Proxying zum Backend

Alle Anfragen unter `/api/*` werden an das Backend (`http://backend:8000`, interner Docker-Service-Name) weitergeleitet. Gemeinsame Proxy-Header sind in `proxy_params` ausgelagert und werden von den meisten spezifischen Routen per `include` eingebunden:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
client_max_body_size 1400M;
proxy_read_timeout 500s;
proxy_connect_timeout 300s;
```

**Begründung der Werte:**

- `client_max_body_size 1400M`: Uploads (IDAT-Dateien für die Methylierungsanalyse) können mehrere hundert MB groß sein; das Limit ist bewusst großzügig, aber nicht unbegrenzt gesetzt.
- `proxy_read_timeout 500s` / `proxy_connect_timeout 300s`: Rechenintensive R-Analyseschritte (DMP/DMR-Berechnung, Batch-Korrektur) können mehrere Minuten dauern; die Standard-Nginx-Timeouts (60s) würden hier zu vorzeitigen Verbindungsabbrüchen führen.
- `X-Forwarded-Proto` / `X-Forwarded-For`: Ermöglichen dem Backend, die ursprüngliche Client-IP und das ursprüngliche Protokoll (HTTPS) zu erkennen, obwohl die Anfrage technisch von Nginx (intern per HTTP) weitergeleitet wird.

### 4.4 Fehlerbehandlung bei Rate-Limit-Überschreitung

Bei Überschreitung eines Rate-Limits liefert Nginx direkt eine strukturierte `429`-Antwort im [RFC 7807 Problem-Details-Format](https://www.rfc-editor.org/rfc/rfc7807), konsistent mit dem Fehlerformat des Backends:

```nginx
error_page 429 /429.json;
location = /429.json {
    default_type application/problem+json;
    return 429 '{"title":"Too Many Requests","status":429,"detail":"Rate limit exceeded. Please wait before retrying."}';
}
```

Dadurch erhält das Frontend bei einer Rate-Limit-Sperre eine Antwort im selben Format wie bei regulären Backend-Fehlern, ohne dass das Backend die Anfrage überhaupt sieht.

---

## 5. Rate-Limiting-Konzept

### 5.1 Ziel

Schutz des Servers vor Überlastung und (unbeabsichtigter oder böswilliger) DoS-artiger Last durch Nginx-basiertes Rate Limiting auf Reverse-Proxy-Ebene. Anfragen werden pro Client-IP-Adresse begrenzt. Bei Überschreitung liefert Nginx direkt `429 Too Many Requests` zurück – die Anfrage erreicht das Backend in diesem Fall gar nicht erst.

### 5.2 Grundannahmen
    
- **Nutzeranzahl:** 1–5 gleichzeitige Nutzer:innen (interne THM-Anwendung, kein öffentlicher Massenzugriff).
- **Status-Polling-Intervall:** 3 Sekunden (Frontend-Standardwert, siehe `useJobPolling.ts`).
- **Burst:** Ein kurzzeitiger Überschuss an Anfragen (z. B. durch Browser-Reload oder schnelle Klicks) wird nicht sofort gesperrt, sondern über einen definierten Burst-Puffer abgefedert.

### 5.3 Rate-Limit-Kategorien

Als grobe Orientierung dienen drei Kategorien, von denen die konkreten Zonen abgeleitet und pro Route feinjustiert wurden:

| Kategorie | Requests/min | Burst | Sperrzeit |
|-----------|--------------|-------|-----------|
| Streng    | 5–10 / min   | 2–3   | ~60s      |
| Mittel    | 20–30 / min  | 5–10  | ~30s      |
| Leicht    | 30–60 / min  | 5–15  | ~10s      |

Einzelne Routen (Upload, Status-Polling, Tabellen-Export, Batch-Verarbeitung) weichen davon gezielt ab, da ihr tatsächliches Nutzungsverhalten sich nicht sauber in ein grobes Drei-Stufen-Schema pressen lässt (siehe Detailbegründungen unten).

### 5.4 Implementierte Rate-Limit-Zonen (Nginx)

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

Jede Zone begrenzt Anfragen pro Client-IP (`$binary_remote_addr`) unabhängig von den anderen Zonen; ein `10m`-Shared-Memory-Bereich reicht für mehrere zehntausend gleichzeitig getrackte IP-Adressen, was für den erwarteten Nutzerkreis (1–5 gleichzeitige Nutzer:innen) weit ausreichend dimensioniert ist.

### 5.5 Routen-Analyse und Zuordnung

#### Upload & Job-Initialisierung

**`POST /api/v1/upload`** → `upload_zone` (6 req/min, `burst=3`, `nodelay`)

```nginx
location ~ ^/api/v1/upload(/|$) {
    limit_req zone=upload_zone burst=3 nodelay;
    proxy_pass http://backend:8000;
    include /etc/nginx/proxy_params;
}
```

- Datei-Upload ist ressourcenintensiv (Dateien bis zu mehreren hundert MB) und stößt sofort Hintergrundprozesse an (Filterung, R-Skript-Start).
- Fehlerhafte Uploads und Neuversuche sind realistisch, aber auf max. ~6 Versuche/min pro Nutzer:in begrenzt.

#### Status & Polling

**`GET /api/v1/status/{job_id}`** → `status_zone` (25 req/min, `burst=10`, `nodelay`)

```nginx
location ~ ^/api/v1/status/ {
    limit_req zone=status_zone burst=10 nodelay;
    proxy_pass http://backend:8000;
    include /etc/nginx/proxy_params;
}
```

- Rechnerische Grundlage: Bei einem Polling-Intervall von 3 Sekunden ergibt sich pro Nutzer ein Bedarf von ca. 20 req/min. Bei bis zu 5 gleichzeitigen Nutzern ergäbe sich in Summe ein Bedarf von bis zu 100 req/min – die Zone ist **pro IP**, weshalb sich der gewählte Wert von 25 req/min am Bedarf eines einzelnen Nutzers orientiert mit kleinem Puffer.

#### Filter-Statistiken

**`GET /api/v1/filter/{job_id}/stats`** → `light_zone` (30 req/min, `burst=5`)

- Wird einmalig nach der Filterung abgerufen, entsprechend geringe erwartete Frequenz.

#### Normalisierungs-Preview

**`GET /api/v1/preview/normalization/{job_id}`** → `medium_zone` (20 req/min, `burst=5`)
**`GET /api/v1/preview/normalization/{job_id}/{plot_name}`** → `medium_zone` (20 req/min, `burst=10`)

- Mehrere Plot-Bilder (JSON für PCA Plots und PNG für Density Plots) werden parallel geladen – ein Request pro Plot. Der Burst muss daher mindestens die Anzahl gleichzeitig ladender Plots (aktuell 5) abdecken.

#### Normalisierung

**`POST /api/v1/normalize/{job_id}`** → `strict_zone` (5 req/min, `burst=2`, `nodelay`)

- Startet einen rechenintensiven R-Prozess; sollte pro Analyse nur wenige Male ausgeführt werden.

#### Batch-Korrektur

| Route                                            | Zone                                      | Begründung                                                              |
|--------------------------------------------------|-------------------------------------------|-------------------------------------------------------------------------|
| `GET /api/v1/batch/{job_id}/batch-options`       | `light_zone` (30/min, burst=5)            | Einmaliger Aufruf beim Laden der Batch-Seite                            |
| `GET /api/v1/batch/{job_id}/history`             | `light_zone` (30/min, burst=5)            | Wird nach jeder Batch-Iteration neu geladen, geringe Frequenz           |
| `GET /api/v1/batch/{job_id}/svd-plot/{round_id}` | `light_zone` (30/min, burst=10)           | PNG-/Plot-Abruf, je nach Anzahl Runden mehrere Requests                 |
| `POST /api/v1/batch/{job_id}`                    | `batch_zone` (10/min, burst=3, `nodelay`) | Startet R-Prozess, biologisch sinnvoll max. 3–5 Iterationen pro Analyse |
| `POST /api/v1/batch/{job_id}/skip`               | `strict_zone` (5/min, burst=2, `nodelay`) | Sollte selten und bewusst ausgeführt werden                             |

#### Tabelle

| Route                                       | Zone                            | Begründung                                                                                                                           |
|---------------------------------------------|---------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `GET /api/v1/table/{job_id}/{table}`        | `table_zone` (30/min, burst=15) | Wird bei Filterung, Sortierung und Pagination aufgerufen; Nutzer:innen können schnell hintereinander klicken, daher hoher Burst-Wert |
| `GET /api/v1/table/{job_id}/{table}/export` | `export_zone` (10/min, burst=3) | CSV-Export kann einen großen DataFrame serialisieren; sollte nicht in schneller Folge wiederholt ausgeführt werden                   |

#### Heatmap

| Route                                  | Zone                                       | Begründung                                                                                                                                       |
|----------------------------------------|--------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| `GET /api/v1/heatmap/{job_id}/options` | `light_zone` (30/min, burst=5)             | Einmaliger Aufruf beim Öffnen des Heatmap-Bereichs                                                                                               |
| `POST /api/v1/heatmap/{job_id}`        | `strict_zone` (10/min, burst=3, `nodelay`) | Startet R-Skript, kann bei großen Datensätzen lange dauern; UI deaktiviert Buttons bereits während laufender Analyse als zusätzliche Absicherung |
| `GET /api/v1/heatmap/{job_id}`         | `medium_zone` (20/min, burst=5)            | Bildabruf nach Generierung; Cache-Buster verhindert Browser-Caching, wodurch jeder Abruf ein echter Request an das Backend ist                   |

#### Reset & Session

**`POST /api/v1/reset/{job_id}`** → `strict_zone` (5 req/min, `burst=2`, `nodelay`)

- Beendet laufende R-Prozesse; muss sauber ablaufen, doppelte/schnell wiederholte Klicks müssen verhindert werden.

### 5.6 Zonen-Übersicht

| Zone | Rate | Typische Routen |
|---|---|---|
| `strict_zone` | 5 req/min | Normalisierung, Reset, Heatmap-Start, Batch-Skip |
| `medium_zone` | 20 req/min | Normalisierungs-Preview, Heatmap-Abruf |
| `light_zone` | 30 req/min | Filter-Stats, Batch-Optionen/-Historie/-SVD-Plot, Heatmap-Optionen |
| `upload_zone` | 6 req/min | Datei-Upload |
| `status_zone` | 25 req/min | Job-Status-Polling |
| `batch_zone` | 10 req/min | Batch-Korrektur-Ausführung |
| `table_zone` | 30 req/min | Tabellenabruf (Filter/Sortierung/Pagination) |
| `export_zone` | 10 req/min | CSV-Export |

### 5.7 Ausblick

Die aktuellen Werte basieren auf manuell gemessenen Analysezeiten mit einem Referenzdatensatz (`data.zip`) und Standardparametern. Bei deutlich abweichenden Datensatzgrößen oder Nutzerzahlen sollten die Zonen-Werte erneut überprüft und ggf. angepasst werden.