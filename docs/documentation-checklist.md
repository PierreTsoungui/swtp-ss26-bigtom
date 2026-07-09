# Dokumentations-Checkliste: MethylAnalyzer

> **Zweck dieses Dokuments.** Diese Checkliste ist die *Single Source of Truth* dafür,
> **welche** Dokumentation/Spezifikation das Projekt braucht, **wo** sie liegt, **wer**
> sie liest, **welchen Inhalt** sie mindestens haben muss und **wie** man die jeweilige
> Komponente erweitert. Sie bewertet den Ist-Zustand, benennt Lücken und definiert den
> Soll-Inhalt jeder Spezifikation.
>
> **Es geht ausschließlich um separate Dokumentation (Markdown unter `/docs`),
> NICHT um Code-Kommentare.** Code-Kommentare (Docstrings, TypeDoc, Roxygen) sind nur
> dort erwähnt, wo sie als *Quelle* für eine generierte/abgeleitete Doku dienen.
>
> **Leitziele des Projekts:** robust, stabil, **erweiterbar**, verständlich.
> Jede geforderte Spezifikation muss mindestens einen Abschnitt **„Extension Points“**
> enthalten — die Frage „Wie füge ich X hinzu, ohne bestehende Verträge zu brechen?“
> muss aus der Doku beantwortbar sein.

---

## Legende & Konventionen

| Symbol | Bedeutung |
|---|---|
| ✅ | Vorhanden und (im Wesentlichen) vollständig |
| 🟡 | Teilweise vorhanden — muss erweitert/aktualisiert werden |
| ❌ | Fehlt vollständig — muss neu erstellt werden |
| ⭐ | **Kritisch für „Erweiterbarkeit“** — höchste Priorität |

**Sprache:** Alle Spezifikationen unter `/docs` werden in **englischem Markdown** verfasst.
(Diese Checkliste ist die einzige Ausnahme und bleibt deutsch.)

**Jede Spezifikation beginnt mit einem standardisierten Kopf:**

```markdown
# <Titel>
**Scope:** <welche Verzeichnisse/Dateien/Services>
**Audience:** <Backend-Dev | Frontend-Dev | R-Dev | DevOps | Reviewer | neue Teammitglieder>
**Status:** Draft | Stable
**Last reviewed:** YYYY-MM-DD
```

**Pflicht-Sektionen je Spezifikation:** *Purpose → Scope → Concepts/Contract →
Reference (Tabellen) → Error/Edge cases → **Extension Points** → Cross-links.*

---

## Ziel-Verzeichnisstruktur von `/docs`

Aktuell liegt alles flach unter `docs/architecture/`. Vorschlag für eine
skalierbare, themenorientierte Struktur:

```
docs/
├── documentation-checklist.md        # dieses Dokument
├── README.md                         # Doku-Index / Einstieg ("Start here")
├── glossary.md                       # ❌ Begriffe & biologische Grundlagen
├── architecture/
│   ├── system-overview.md            # 🟡 C4-Kontext+Container, übergreifend
│   ├── backend-architecture.md       # ✅ vorhanden
│   ├── frontend-architecture.md      # ❌ neu
│   ├── r-backend-architecture.md     # ❌ neu (Pipeline-Skripte gesamt)
│   ├── r-executor.md                 # ✅ vorhanden
│   ├── pipeline-progress.md          # ✅ vorhanden
│   ├── job-lifecycle.md              # ❌ neu (State-Machine + Storage + DSGVO)
│   └── decisions/                    # ❌ ADRs (Architecture Decision Records)
│       └── NNNN-<titel>.md
├── api/
│   └── api-contract.md               # ✅ vorhanden
├── contracts/
│   ├── job-directory-layout.md       # ❌ Dateivertrag jobs/<id>/
│   ├── samplesheet-spec.md           # ❌ kanonisches Sample-Sheet
│   └── filter-mapping.md             # ❌ End-to-end Filter-Mapping (FE↔BE↔R)
├── backend/
│   ├── services-reference.md         # ✅ vorhanden
│   ├── security.md                   # ❌ Path-Traversal, Archive, Magic Bytes
│   ├── configuration.md              # ✅ vorhanden
│   └── logging-backend.md            # ✅ vorhanden
├── r-backend/
│   ├── scripts-reference.md          # ❌ je Skript: I/O, Env, Output
│   └── biology-primer.md             # ❌ (kann auch in glossary.md)
├── frontend/
│   ├── hooks-reference.md            # ❌
│   ├── components-reference.md       # ❌
│   └── theming.md                    # ❌
├── deployment/
│   ├── docker.md                     # ❌ Compose, Volumes, Sockets
│   └── https-nginx.md                # ❌ Reverse Proxy / TLS
├── testing/
│   └── testing-strategy.md           # ❌ pytest / testthat / vitest / e2e
└── contributing/
    ├── contributing.md               # ❌ Dev-Setup, Branch/Commit-Konventionen
    └── extension-playbooks.md        # ⭐❌ "How do I add …"-Kochbuch
```

> Bestehende Dateien müssen nicht zwingend verschoben werden — wichtiger ist, dass
> `docs/README.md` als **Index** auf alles verlinkt, damit kein Dokument „verwaist“.

---

## 0. Doku-Infrastruktur (übergreifend)

| # | Item | Status | Anmerkung |
|---|---|---|---|
| 0.1 | `docs/README.md` als Einstiegs-Index („Start here“, Lesepfade pro Rolle) | ❌ | Verlinkt alle Specs; nennt pro Rolle (Backend/Frontend/R/DevOps) den empfohlenen Lesepfad |
| 0.2 | Einheitlicher Spec-Header (Scope/Audience/Status/Last reviewed) auf allen Dokumenten | 🟡 | Vorhandene Docs nachziehen |
| 0.3 | Glossar / Abkürzungsverzeichnis | ❌ | Siehe §9 |
| 0.4 | ADR-Verzeichnis (`architecture/decisions/`) für Architekturentscheidungen | ❌ | Siehe §11 |
| 0.5 | Diagramm-Quellen versioniert ablegen (`.drawio`/`.mmd` + exportiertes `.svg`) | ❌ | Mermaid bevorzugt (im Markdown renderbar, diffbar) |

---

## 1. Projektübergreifende Dokumentation

### 1.1 README.md — 🟡 vorhanden (Root, deutsch)
- [x] Kurzbeschreibung, Stack, Voraussetzungen
- [x] Schnellstart (`docker compose up --build`), Ports/Services, Container-Übersicht
- [x] Projektstruktur-Baum, Upload-Workflow
- [ ] 🟡 **Veraltet:** Projektstruktur nennt nur `upload.py/status.py`, `temp/` — Ist-Stand ist deutlich größer (8 Routen, `jobs/`, `staging/`). Angleichen.
- [ ] **Link-Block zu `/docs`** (Verweis auf den Doku-Index aus 0.1)
- [ ] Hinweis auf Demo-Datensatz (`data/`, EPICv2, 4 Samples) inkl. erwarteter Laufzeit
- [ ] Kurzer „Architektur in 5 Sätzen“-Absatz mit Link auf `system-overview.md`

### 1.2 CHANGELOG.md — ✅ vorhanden
- [ ] Format-Konvention festschreiben (Keep-a-Changelog: Added/Changed/Fixed/Removed)
- [ ] Semantische Versionierung dokumentieren, Issue-/US-Referenzen wo vorhanden

---

## 2. Architektur & System

### 2.1 System-Overview — 🟡 (Kontext steckt in `backend-architecture.md §1.1`)
*Datei: `docs/architecture/system-overview.md`*
- [ ] Eigenständiges Dokument, das **alle drei Services** gleichwertig behandelt (nicht backend-zentriert)
- [ ] **Diagramm: C4 Level 1 (System Context)** — Nutzer ↔ Plattform ↔ (kein externer Dienst)
- [ ] **Diagramm: C4 Level 2 (Container)** — Frontend(nginx) / Backend(FastAPI) / R-Worker / geteilte Volumes
- [ ] Die **zwei** Kommunikationskanäle Backend↔R explizit: (a) `docker exec` + stdout, (b) geteiltes `jobs/`-Volume
- [ ] **Diagramm: Sequenzdiagramm** „Upload → Filter → Normalize-Preview → Normalize → Batch → DMP/DMR → Table/Heatmap“
- [ ] Async-/Fire-and-forget-Ausführungsmodell + Polling erklärt (Verweis auf `pipeline-progress.md`)
- [ ] Technologie-/Versionsmatrix (Python 3.11, R 4.4.1, Node 20, FastAPI, MUI/Tailwind …)
- [ ] Verweis auf ADRs für die großen Entscheidungen (warum R-via-docker-exec, warum dateibasiert)

### 2.2 API-Vertrag — ✅ vorhanden (`api-contract.md`, 1250 Zeilen)
- [x] Endpoints, RFC-9457-Fehlerformat, Beispiele
- [ ] **Prüfen auf Vollständigkeit** gegen `main.py`: alle Router (`upload, status, stats, normalization_preview, normalize, reset, batch, heatmap, table`) und Sub-Routen (`/batch/.../skip`, `.../history`, `.../svd-plot/{n}`, `.../batch-options`, `/heatmap/.../options`, `/table/.../export`) enthalten?
- [ ] Versionierungsstrategie der API (`/api/v1`) + Deprecation-Policy explizit
- [ ] Vollständige Auflistung aller `status`- und `phase`-Werte (Querverweis auf `job-lifecycle.md`)
- [ ] Hinweis: Swagger-UI unter `:8000/docs` als ergänzende, generierte Quelle
- [ ] Content-Types der Binär-/Artefakt-Antworten (PNG/PDF/CSV/JSON) je Endpoint

### 2.3 Pipeline & Progress — ✅ vorhanden (`pipeline-progress.md`)
- [x] 3-Schichten-Vertrag R→Backend→Frontend, JSON-Events, Flush-Pflicht, Monotonie
- [ ] **Diagramm: Zustandsdiagramm `status × phase`** ergänzen (oder nach `job-lifecycle.md` auslagern + verlinken)
- [ ] Terminal-States explizit benennen (`completed`/`failed`/`cancelled`?)
- [ ] Verhalten bei `returncode != 0` und bei abgebrochenem Job (Querverweis `r-executor.md`)

---

## 3. Backend-Dokumentation

### 3.1 Service-Referenz — 🟡 (Tabelle in `backend-architecture.md §3`)
*Datei: `docs/backend/services-reference.md` (oder Ausbau von backend-architecture)*
Betrifft alle `app/services/*`: `job_manager`, `pipeline_task`, `r_executor/*`,
`file_handler`, `archive_utils`, `staging_manager`, `upload_inspect_service`,
`upload_commit_service`, `upload_service`, `samplesheet_normalizer`,
`samplesheet_utils`, `batch_service`, `heatmap_service`,
`normalization_preview_service`, `normalize_service`, `table_handler`,
`table_filter`, `reset_service`, `job_cleanup_service`.

Pro Service mindestens:
- [ ] Verantwortlichkeit (Single Responsibility) in 1–2 Sätzen
- [ ] Öffentliche Funktionen: Signatur, Parameter, Rückgabe, Seiteneffekte (Dateien!)
- [ ] Geworfene Exceptions / Fehlerfälle (Verweis `core/exceptions.py`, `error_types.py`)
- [ ] Abhängigkeiten zu anderen Services (Aufruf-Richtung — „darf nach unten zeigen“)
- [ ] **Extension Point:** wie ergänzt man Logik, ohne die Schichtregel zu verletzen
- [ ] **Aktualisieren:** die Service-Tabelle in `backend-architecture.md` nennt nur eine Teilmenge; die zwei-/dreiphasige Upload-Kette (`inspect`/`commit`/`staging`) und `samplesheet_normalizer` fehlen dort.

### 3.2 Job-Lifecycle & State-Machine — ❌ (verstreut)  ⭐
*Datei: `docs/architecture/job-lifecycle.md` — **eigene, kritische Spezifikation***
- [ ] Job-Identität: was ist eine `job_id`, wann entsteht sie
- [ ] **Vollständige Aufstellung aller `status`-Werte und aller `phase`-Werte** (aus `models/job.py` + Routen abgeleitet) als Tabelle
- [ ] **Diagramm: State-Machine** — erlaubte Übergänge, Terminal-States, wer den Übergang auslöst (Route vs. Pipeline-Task)
- [ ] **Storage-Vertrag:** Unterschied `jobs/` (persistent) vs. `staging/` (Upload-Zwischenstand, Sibling für atomares Move) — **Querverweis `job-directory-layout.md`**
- [ ] **Aufbewahrung & Löschung (DSGVO):** TTL-basiertes Cleanup via mtime; zwei Loops (Job + Staging); konfigurierbare Retention; Doku der **Default-Werte** (Jobs 24 h, Staging 2 h) und Cleanup-Intervalle
- [ ] Manuelles Löschen via `POST /reset/{job_id}` (Cancel + Delete) inkl. Wirkung auf laufende R-Subprozesse
- [ ] Verhalten bei Server-Neustart (In-Memory-State vs. Platte — wird Status persistiert?) **explizit klären und dokumentieren**
- [ ] **Extension Point:** neue Phase einführen (Auswirkung auf State-Machine, Status-Endpoint, Frontend-`workflowSteps`)

### 3.3 R-Executor — ✅ vorhanden (`r-executor.md`)
- [x] `run_r_script()`-Engine, `RCommand`-Muster, Timeout, Cancellation, Progress-Callback
- [ ] **Extension Point schärfen (⭐):** „Neue R-Stufe = neue `RCommand`-Dataclass in `commands.py`, **nie** `executor.py` anfassen“ — mit vollständigem Minimalbeispiel (`build_cmd`, optional `parse_stdout`)
- [ ] Sonderfall `BetaExtractionCommand` (gesperrter `script_path`, inline `Rscript -e`) als dokumentierte Ausnahme
- [ ] Container-Name & `docker exec`-Aufrufkonvention konfigurierbar dokumentieren

### 3.4 Filter & Tabellen — 🟡 (Logik in `table_filter.py`, undokumentiert)
*Bevorzugt als End-to-End-Vertrag: `docs/contracts/filter-mapping.md` (siehe §10)*
- [ ] Unterstützte Operatoren: `eq`, `contains` (case-insensitive substring), `gte`, `lte`, `abs_gte`, `abs_lte`, `direction` (hyper/hypo) — je Operator Semantik + erlaubte Spaltentypen
- [ ] **Mapping-Tabellen DMP & DMR** (Frontend-Feld → R-Spalte → Operator) aus `table_filter.py` (`start→POS/gte`, `gene→GENE/contains`, `delta_beta→DELTA_BETA/abs_gte`, `delta_direction→…/direction`, DMR: `mean_diff_*`, `width_*`, `n_dmps_*`, …)
- [ ] Paginierung & Sortierung (`table_handler.py`) dokumentieren
- [ ] Validierung/Fehler bei unbekanntem Filter oder ungültigem Wert (`Unknown filter`, `Invalid filter value`)
- [ ] „Keep-all-rows“-Semantik der Tabellen (kein serverseitiges Verwerfen) festhalten
- [ ] **Extension Point:** neuen Filter hinzufügen = Eintrag in `DMP_MAP`/`DMR_MAP` + ggf. neuer Operator-Branch + Frontend-`tableFilters.ts` + `filter-mapping.md` aktualisieren

### 3.5 Backend-Security — ❌  ⭐
*Datei: `docs/backend/security.md`*
- [ ] **Path-Traversal-Schutz** (Upload-Pfade, Job-IDs) — wo validiert, welche Garantien (Test: `test_path_traversal_dateikollission.py`)
- [ ] **Sichere Archiv-Extraktion** (`archive_utils.py`): Zip-Slip-Schutz, Größen-/Entpack-Limits, erlaubte Member-Typen
- [ ] **Datei-Validierung**: Magic-Bytes/Endungen für IDAT & CSV, Größenlimits (`core/upload_limits.py`)
- [ ] Zwei-Phasen-Upload als Sicherheits-/Robustheitsmaßnahme (inspect → commit; nichts wird ohne Bestätigung in `jobs/` übernommen)
- [ ] CORS-Policy (aktuell `localhost:3000/8080`) + Hinweis für Prod-Härtung
- [ ] **Docker-Socket-Mount** (`/var/run/docker.sock` im Backend) als bewusstes, dokumentiertes Risiko inkl. Hinweis auf Härtung
- [ ] Security-relevante Header (Verweis nginx/`https-nginx.md`)
- [ ] DSGVO-Bezug (temporäre Speicherung, Auto-Löschung) — Querverweis `job-lifecycle.md`

### 3.6 Konfigurationsreferenz — ✅
*Datei: `docs/backend/configuration.md`*
- [ ] Tabelle aller Env-Vars mit **Name · Default · Einheit · Wirkung · Validierung**:
      `JOB_BASE_DIR` (`./jobs`), `JOB_RETENTION_HOURS` (24), `JOB_CLEANUP_INTERVAL_SECONDS`,
      `STAGING_BASE_DIR` (`./staging`), `STAGING_RETENTION_HOURS` (2), `STAGING_CLEANUP_INTERVAL_SECONDS`,
      `DMR_CORES` (4), `PYTHONUNBUFFERED`, R-Threading-Vars (`OMP_NUM_THREADS`, `OPENBLAS_NUM_THREADS`, …)
- [ ] Hinweis auf Validierung (`_get_positive_int/float`, Abbruch bei ≤ 0)
- [ ] Abgleich mit `.env.example` und `docker-compose.yml` (eine Quelle, beide referenzieren)

---

## 4. R-Backend-Dokumentation

### 4.1 R-Backend-Architektur (Übersicht) — ❌
*Datei: `docs/architecture/r-backend-architecture.md`*
- [ ] Pipeline-Reihenfolge der Skripte + welcher RDS/PNG/JSON-Output an welche nächste Stufe geht
- [ ] Gemeinsame Utilities: `utils/progress.R` (Verweis `pipeline-progress.md`), `utils/samplesheet.R`
- [ ] Aufrufkonvention/Argument-Shape der Skripte (Filtering-Shape: `sample_sheet, job_dir, *args`)
- [ ] Container-Umgebung & Threading-Constraints (`*_NUM_THREADS=1`, `DMR_CORES`)

### 4.2 R-Skript-Referenz (je Skript) — ❌  ⭐
*Datei: `docs/r-backend/scripts-reference.md`*
Betrifft: `init_filter.R`, `normalize.R`, `normalization_preview.R`,
`scatterplot_normalization.R`, `batch_svd.R`, `batch_correct.R`, `dmp.R`, `dmr.R`,
`heatmap.R`, `data.R`.

Pro Skript mindestens:
- [ ] Zweck + biologischer Kontext (1–3 Sätze, Verweis Glossar)
- [ ] **Eingabe:** Positions-Argumente **und** Umgebungsvariablen
- [ ] **Ausgabe:** erzeugte Dateien (RDS/PNG/PDF/JSON) mit exakten Dateinamen → speist `job-directory-layout.md`
- [ ] Erwartete Eingabe-Spalten (inkl. case-insensitive Suche `has_col_ci`)
- [ ] Progress-Events, die das Skript emittiert (Verweis Contract)
- [ ] Verwendete R-Pakete
- [ ] Fehlerfälle + Fehlermeldungen (`emit_error`)
- [ ] **Extension Point:** Checkliste „Neues R-Skript anlegen“ — `source(progress.R)` zuerst, Argument-Shape, Output-Konvention, dazugehörige `RCommand` im Backend

### 4.3 Sample-Sheet-Spezifikation — ❌  ⭐
*Datei: `docs/contracts/samplesheet-spec.md`*
- [ ] **Kanonisches Illumina-CSV** als interne Norm: alle Uploads werden beim Upload kanonisiert
- [ ] Pflicht-/optionale Spalten, die 4 Rollen (Sentrix/Sample-ID, Gruppe/Batch/Covariate …) und ihre Bedeutung
- [ ] **User-Mapping (SSM):** wie der Nutzer Roh-Spalten via Dropdowns auf Rollen mappt; Anwendung beim Commit
- [ ] Batch- vs. Covariate-Rollen (beliebige Spaltennamen, permissiv) — Querverweis Batch
- [ ] Validierungsregeln + Fehlermeldungen (`samplesheet_normalizer.py`, `samplesheet_utils.py`, `utils/samplesheet.R`)
- [ ] **Extension Point:** neue Rolle/Spalte ergänzen (Normalizer + Mapper-UI + R-Konsumenten)

### 4.4 Biologische Grundlagen — ❌ (→ Glossar §9 oder eigene Datei)
*Datei: `docs/r-backend/biology-primer.md`*
- [ ] DNA-Methylierung kurz für ein technisches Team
- [ ] IDAT-Format, Chip-Typen (EPIC v1/v2, 450K), Red/Grn-Paare
- [ ] Normalisierungsmethoden (RAW, NOOB, QUANTILE, SWAN, FUNNORM) — wann welche
- [ ] β-/M-Werte, DMP vs. DMR, Δβ/`mean diff`/`logFC`
- [ ] Batch-Effekt & SVD-Plot-Interpretation (was bedeuten die PC-Blöcke/%)

---

## 5. Frontend-Dokumentation

### 5.1 Frontend-Architektur — 🟡 (`frontend/app/src/README.md`, deutsch, knapp)
*Datei: `docs/frontend/frontend-architecture.md` (oder Ausbau des src-README; dann verlinken)*
- [x] Feature-basierte Ordnerstruktur, `features/` vs. `shared/`, Tailwind-Styling
- [ ] **Routing-Übersicht:** alle Seiten/Pfade (Landing, Upload, Analysis, Normalisation, Batch, Tableview/Results, Datenschutz) als Tabelle
- [ ] **Diagramm: Komponentenbaum** der Hauptseiten + `AppLayout`/`StepIndicator`/Workflow-Steps
- [ ] State-Management-Konzept: lokaler State + Hooks, kein globaler Store; **Polling-Modell** (Querverweis `pipeline-progress.md`)
- [ ] API-Zugriffsschicht (`uploadApi.ts` etc.), Fehlerbehandlung (`shared/error-handling`)
- [ ] Sprache: src-README ist deutsch — Konvention festlegen (FE-Doku darf deutsch bleiben oder auf englisch ziehen)

### 5.2 Hooks-Referenz — ❌
*Datei: `docs/frontend/hooks-reference.md`*
Betrifft: `useJobPolling`, `useJobCancel`, `useFilterStats`, `useUploadFlow`,
`useTableData`, `useTableFilters`, `useTableState`, `useGenerateHeatMap`,
`useHeatMapOptions`, `useNormalizationPreview`, `useBatchCorrection`, `useBatchParameters`.

Pro Hook: Zweck, Parameter, Rückgabewerte, **wann Polling stoppt (Terminal-States)**,
Fehlerbehandlung, Abhängigkeit zu welchem Endpoint.
- [ ] Empfehlung: TypeDoc-Kommentare als Quelle, daraus generierte/abgeleitete Referenz

### 5.3 Komponenten-Referenz (nur komplexe) — ❌
*Datei: `docs/frontend/components-reference.md`*
Betrifft u. a.: `TableContainer`, `AnalysisTable`, `TableFilters`, `HeatMap`,
`SvdPlot`, `PcaPlot`/`PcaViewer`, `Progressbar`, `StepIndicator`,
`ColumnRoleMapper`, `FilterPanel`, `NormalizationPage`, `BatchForm`.
- [ ] Props-Interface (TypeDoc), Einbettung/Verwendungszweck
- [ ] UI-Zustände: Loading/Error/Empty (Skeletons, ErrorMessage)
- [ ] Barrierefreiheit (aria-Attribute) wo relevant
- [ ] Export-/Download-Funktionen (`downloadHeatmap`, `exportSvg`, `TableExportButton`)

### 5.4 Theming & Design — ❌
*Datei: `docs/frontend/theming.md`*
- [ ] Farbsystem: `shared/theme/colors.ts`, CSS Custom Properties, Tailwind v4 `@theme`
- [ ] MUI-Integration (sx-Props mit CSS-Variablen), Zusammenspiel Tailwind ↔ MUI
- [ ] Design-Tokens + Konventionen für neue Komponenten

### 5.5 Frontend-Filter-Mapping — 🟡 (Teil von §10)
- [ ] **Tabelle:** welche Tabellenfilter werden an die Heatmap übergeben
- [ ] Konvertierung `tableToDmpFilter` (bzw. `utils/types.ts`, `tableFilters.ts`) erklärt
- [ ] Nicht unterstützte Filter + UI-Hinweise; **Single-Filter-Source** Tabelle==Heatmap

---

## 6. Daten- & Schnittstellen-Verträge (`docs/contracts/`)

### 6.1 Job-Directory-Layout — ❌  ⭐
*Datei: `docs/contracts/job-directory-layout.md`*
- [ ] **Vollständiger Dateibaum von `jobs/<job_id>/`**: welche Datei in welcher Phase entsteht (sample sheet, gefilterte RDS, `filter_stats.json`, `preview_plots.json` + PNGs, normalisierte RDS, SVD-Plots/JSON, batch-history, DMP/DMR-Ergebnis-RDS/CSV, heatmap PNG/PDF)
- [ ] Wer schreibt (R) / wer liest (Backend-Routen) jede Datei → **der entscheidende Vertrag zwischen R und Backend**
- [ ] Namenskonventionen (Plot-Namen, Iterationsindizes der SVD-Plots)
- [ ] Verhältnis zu `staging/<id>/` (Upload-Zwischenstand)
- [ ] **Extension Point:** neue Artefakte korrekt benennen/ablegen, ohne Cleanup/Serving zu brechen

### 6.2 Sample-Sheet-Spec — ❌  → siehe §4.3

### 6.3 Filter-Mapping (End-to-End) — ❌  ⭐  → siehe §10

---

## 7. Deployment & Betrieb

### 7.1 Docker & Infrastruktur — ❌
*Datei: `docs/deployment/docker.md`*
- [ ] `docker-compose.yml` Service für Service erklärt (frontend/backend/r_worker)
- [ ] **Alle Volumes** + Zweck: `./jobs`, `./r_backend`, `./data`, Docker-Socket
- [ ] Warum der Backend-Container den **Docker-Socket** mountet (R-via-exec) + Risiko/Härtung
- [ ] R-Worker-Besonderheiten: `seccomp:unconfined`, ulimits, `tail -f /dev/null`, Threading-Env
- [ ] Env-Vars (Querverweis `configuration.md`), Build-Dauer R-Container (~40–60 min, Cache)
- [ ] Erststart-/Rebuild-Verhalten, Healthchecks (falls geplant)

### 7.2 HTTPS & Nginx — ❌
*Datei: `docs/deployment/https-nginx.md`*
- [ ] `frontend/nginx.conf` erklärt (SPA-Routing `try_files`, Proxy zu Backend?)
- [ ] TLS-Zertifikate (selbstsigniert / Let's Encrypt), HTTP→HTTPS-Redirect
- [ ] Security-Header, Proxy-Timeouts/Bodysize für große Uploads
- [ ] THM-internes Deployment-Setup

### 7.3 Logging — ✅ vorhanden (`logging-backend.md`)
- [x] Prinzipien, zentrale Config, Level-Guidelines, Blueprint
- [ ] Ergänzen: **wo** Logs abrufbar sind (`docker logs <service>`), R-stdout vs. Python-Logs
- [ ] Frontend-Fehler-/Telemetrie-Strategie (falls vorhanden) — sonst „nicht vorhanden“ explizit

---

## 8. Tests

*Datei: `docs/testing/testing-strategy.md` (eine Übersicht, je Stack eine Sektion)*

### 8.1 Backend (pytest) — ❌
- [ ] Ausführung (`pytest`), Verzeichnis `backend/tests/`
- [ ] Fixtures/Testdaten (`conftest.py`), Mocking-Strategie (R-Executor gemockt?)
- [ ] Abdeckung je Modul grob (upload/inspect/commit, table/export, heatmap, normalization(+pca), batch, samplesheet, archive, path-traversal, job-cleanup, stats)
- [ ] **Bekannte/Vorbestehende Failures + benötigte Umgebung dokumentieren** (es gibt keine Projekt-venv)

### 8.2 R (testthat) — ❌
- [ ] Ausführung, Testdaten/Fixtures, Snapshot-Tests (`tests/_snaps/`)
- [ ] Integrationstest (`test_pipeline_integration.R`) — was er abdeckt, Laufzeit

### 8.3 Frontend (Vitest) — ❌
- [ ] Ausführung (`npm test`), Komponenten-/Hook-Tests, API-Mock-Strategie

### 8.4 E2E (Playwright) — ❌ (falls vorhanden/geplant)
- [ ] Status klären: existiert E2E? Falls nein, als „geplant/nicht vorhanden“ markieren statt Soll-Inhalt zu erfinden
- [ ] Falls ja: Voraussetzungen (laufende Container, Testdaten), Szenarien

---

## 9. Glossar & biologische Grundlagen — ❌
*Datei: `docs/glossary.md`*
- [ ] Fachbegriffe (Methylierung, β/M-Wert, CpG, DMP/DMR, Batch-Effekt, SVD/PCA)
- [ ] Technische Begriffe & Abkürzungen (IDAT, EPICv2, RDS, RFC 9457, UPPC/Progress-Contract, Job/Phase/Status)
- [ ] Methoden-Kürzel (RAW/NOOB/QUANTILE/SWAN/FUNNORM)
- [ ] Dient als Anker für Querverweise aus allen anderen Specs

---

## 10. Filter-Mapping End-to-End — ❌  ⭐
*Datei: `docs/contracts/filter-mapping.md` — **die wichtigste „Verständlichkeit“-Spec für Filter***

Eine **durchgängige Tabelle** über alle Schichten, weil Filter heute an drei
Stellen leben (Frontend `tableFilters.ts`, Backend `table_filter.py`, R-Spalten):

- [ ] **Spalte für Spalte:** Frontend-Feld → Query-Param (`filter_*`) → Backend-Operator → R/CSV-Spaltenname → Bedeutung
      (DMP: `start/stop/gene/adj_p_value/delta_beta/delta_direction/group{1,2}_avg_{min,max}/log_fc_{min,max}`;
       DMR: `start/stop/p_value/mean_diff_{min,max}/width_{min,max}/n_dmps_{min,max}`)
- [ ] Operator-Katalog mit Semantik (`eq`, `contains`, `gte`, `lte`, `abs_gte`, `abs_lte`, `direction`)
- [ ] **Parität Tabelle ↔ Heatmap** (eine Filterquelle), `tableToDmpFilter`-Konvertierung, nicht unterstützte Filter
- [ ] Fehlerverhalten (unbekannter Filter / ungültiger Wert)
- [ ] **Extension Point:** „Neuen Filter end-to-end hinzufügen“ als nummerierte Schritt-für-Schritt-Liste

---

## 11. Architecture Decision Records (ADRs) — ❌
*Verzeichnis: `docs/architecture/decisions/NNNN-<slug>.md`* (Format: Context / Decision / Consequences)

Mindestens folgende Entscheidungen festhalten (sie prägen die gesamte Erweiterbarkeit):
- [ ] ADR: R-Ausführung über `docker exec` statt eingebettetem Prozess/HTTP-Service
- [ ] ADR: Dateibasierte Kommunikation über `jobs/`-Volume statt DB/Message-Queue
- [ ] ADR: In-Memory-Jobstatus + Polling statt WebSockets/Persistenz
- [ ] ADR: Zwei-Phasen-Upload (inspect→commit) + Staging-Verzeichnis
- [ ] ADR: `RCommand`-Pattern (offen für Erweiterung, geschlossen für Änderung des Executors)
- [ ] ADR: RFC-9457-Fehlerformat
- [ ] ADR: TTL-/mtime-basiertes Cleanup statt Job-Scheduler-Tracking

---

## 12. Erweiterbarkeits-Playbooks (Kochbuch) — ❌  ⭐⭐
*Datei: `docs/contributing/extension-playbooks.md`*

> Das zentrale Dokument für das Ziel **„erweiterbar“**. Jeder Eintrag ist eine
> nummerierte, copy-paste-fähige Schritt-für-Schritt-Anleitung mit **berührten
> Dateien** und **Tests, die anzupassen sind**.

- [ ] **Neuen Pipeline-Schritt / neue R-Stufe hinzufügen:** R-Skript anlegen (progress-Contract) → `RCommand` in `commands.py` → Service → Route → `job-directory-layout.md` → State-Machine/Phase → Frontend-Step/Hook → Tests
- [ ] **Neue Normalisierungsmethode hinzufügen:** `normalize.R` → Preview → Backend-Enum/Model (`models/normalize.py`) → Frontend `MethodCard` → Doku/Glossar
- [ ] **Neuen Tabellen-/Heatmap-Filter hinzufügen:** `table_filter.py` Map + Operator → `tableFilters.ts` → `filter-mapping.md` → Tests (`test_table.py`, `useTableFilters.test.ts`)
- [ ] **Neue Sample-Sheet-Rolle/Spalte hinzufügen:** `samplesheet_normalizer.py`/`utils/samplesheet.R` → `ColumnRoleMapper` → R-Konsumenten → `samplesheet-spec.md`
- [ ] **Neuen API-Endpoint hinzufügen:** Route → Pydantic-Model → Service → `api-contract.md` → Fehlerformat → Tests
- [ ] **Neuen Job-Status/-Phase hinzufügen:** `models/job.py` → State-Machine-Doku → Status-Endpoint → Frontend-`workflowSteps`/Polling-Terminal-States
- [ ] **Neue Env-Var/Konfiguration hinzufügen:** `core/config.py` (mit Validierung) → `compose`/`.env.example` → `configuration.md`
- [ ] Verweis auf `contributing.md` für Branch-/Commit-Konventionen (Commits sind hier `type(scope): …`, deutsch)

---

## 13. Empfohlene Diagramme — Übersicht

| Dokument | Diagrammtyp | Empf. Tool | Status |
|---|---|---|---|
| `system-overview.md` | C4 Context (L1) | Mermaid/draw.io | ❌ |
| `system-overview.md` | C4 Container (L2) | Mermaid/draw.io | ❌ |
| `system-overview.md` | Sequenzdiagramm Upload→Ergebnis | Mermaid | ❌ |
| `job-lifecycle.md` | State-Machine (status×phase) | Mermaid | ❌ |
| `r-backend-architecture.md` | Datenfluss-Diagramm (RDS-Kette) | Mermaid | ❌ |
| `frontend-architecture.md` | Routing-Flow + Komponentenbaum | Mermaid/draw.io | ❌ |
| `job-directory-layout.md` | Datei-/Verzeichnisbaum | Markdown | ❌ |
| `filter-mapping.md` | Mapping-Tabelle | Markdown | ❌ |

> **Empfehlung:** Mermaid bevorzugen — direkt im Markdown renderbar, versionierbar,
> diffbar. draw.io nur dort, wo Mermaid an Grenzen stößt (`.drawio` + `.svg` committen).

---

## 14. Priorisierte Roadmap (Vorschlag)

**P0 — Verträge, ohne die Erweiterung gefährlich ist (⭐):**
1. `contracts/job-directory-layout.md` (§6.1)
2. `architecture/job-lifecycle.md` (§3.2)
3. `r-backend/scripts-reference.md` (§4.2)
4. `contributing/extension-playbooks.md` (§12)
5. `contracts/filter-mapping.md` (§10)

**P1 — Robustheit/Betrieb & Verständlichkeit:**
6. `backend/security.md` (§3.5) · `backend/configuration.md` (§3.6)
7. `deployment/docker.md` + `https-nginx.md` (§7)
8. `contracts/samplesheet-spec.md` (§4.3) · `glossary.md` (§9)
9. `architecture/system-overview.md` ausbauen + Diagramme (§2.1)

**P2 — Frontend-Detailreferenzen & Tests:**
10. `frontend/hooks-reference.md`, `components-reference.md`, `theming.md` (§5)
11. `testing/testing-strategy.md` (§8)
12. ADRs nachziehen (§11), `docs/README.md`-Index (§0.1)

---

## Zusammenfassung des Ist-Zustands

**Bereits stark dokumentiert (✅):** API-Vertrag, Backend-Architektur (Layer/Service-Überblick),
R-Executor, Pipeline-Progress-Contract, Backend-Logging — sowie Root-README und Frontend-src-README.

**Die größten Lücken mit Blick auf „erweiterbar/robust/verständlich“ (⭐):**
der **Dateivertrag `jobs/<id>/`**, die **Job-State-Machine + Aufbewahrung/Löschung**,
die **R-Skript-Referenz**, das **End-to-End-Filter-Mapping**, die **Sicherheits-Spec**
und vor allem das **Erweiterbarkeits-Kochbuch** — das Dokument, das ein neues Teammitglied
in die Lage versetzt, eine neue Pipeline-Stufe, Methode oder Filter sauber hinzuzufügen,
ohne bestehende Verträge zu brechen.
