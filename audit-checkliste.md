# Technisches Audit – Stabilisierungs-Checkliste (vor Abgabe)

> Internes Arbeitsdokument eines unabhängigen Reviews. Es enthält **ausschließlich reale,
> nachgeprüfte Befunde**. Keine Feature-Vorschläge, keine Architektur- oder größeren
> Refactoring-Empfehlungen. Fokus: mit geringem Aufwand vor der Abgabe behebbare Probleme.
>
> **Revision 4** – Finale Re-Prüfung vor Abgabe (unabhängiger Reviewer).
> **Phase 1 (Fixes validiert):** **A-1** ist vollständig und robust behoben — unabhängig
> verifiziert: `getBeta(RGChannelSet)` funktioniert (RAW-Pfad intakt), und
> `restrict_to_passed_probes` reduziert eine echte 936 990-Sonden-Matrix korrekt; der Fix greift
> über skip/batch/raw, Heatmap transitiv. **B-1** und **N-1** verifiziert: `docker compose config`
> rendert effektiv `DMR_CORES: "1"` bzw. den fixen `container_name`; Regressionstests vorhanden.
> **P-1 bleibt offen** (nur B-1/N-1 wurden umgesetzt) — Befund und Lösung unverändert gültig.
> **Phase 2–4 (neuer Befund):** **R-1 (Hoch)** — ungeschützter Voll-CSV-Read pro Request in der
> Tabellen-/Heatmap-Schicht → Backend-OOM-Risiko (Abschnitt 2, als **NEU** markiert).
>
> **Revision 3** – Ergänzt um die Analyse eines **real gemeldeten Produktions-Incidents**
> (`PermissionError: [Errno 13] Permission denied: 'staging'` beim Upload) sowie die
> systematische Suche nach demselben Fehlertyp: siehe **P-1** (Abschnitt 2) und den neuen
> **Abschnitt 7 (Pfad-/Env-Robustheit)**.
>
> **Revision 2** – Diese Fassung ist das Ergebnis von (1) einer kritischen Re-Validierung jedes
> Punktes der ersten Fassung gegen den Code und (2) einem unabhängigen zweiten Durchgang durch
> Backend, R-Backend, Frontend, Tests, Doku, Docker/Config und Skripte.
>
> Ergebnis der Re-Validierung: **kein Punkt der ersten Fassung war unbegründet** (nichts
> entfernt); mehrere wurden präzisiert. **Neu hinzugekommen:** N-1 (hartkodierter
> Container-Name), N-2 (Heatmap-Limit 500 vs. 1000), N-3–N-6 (Mixed-Language/Dead-Code/kleine
> Inkonsistenzen).
>
> Format je Punkt: **Priorität · Datei(en) · Beschreibung · Begründung · Lösung · Aufwand**.

---

## 0. Kurzfassung – die Abgabe-Risiken

**Offen:**

1. **P-1 (Hoch, real aufgetreten):** Bei leerem/relativem `JOB_BASE_DIR` werden
   `STAGING_BASE_DIR` und die Job-Verzeichnisse zu **relativen** Pfaden → `mkdir` landet im
   root-eigenen `/app` → `PermissionError` → Upload und gesamte Pipeline unbrauchbar. Ganze
   Fehlerklasse, siehe Abschnitt 7.
2. **R-1 (Hoch, 🆕 NEU Revision 4):** Tabellen-/Heatmap-Schicht liest die vollständige
   Ergebnis-CSV (EPICv2 ~140 MB) bei **jedem** Request neu, ungecacht und ungedrosselt → Backend
   kann sein 1-GB-Limit sprengen → OOM-Kill → **alle** In-Memory-Sitzungen verloren (Abschnitt 2).

**Behoben (Revision 4 re-validiert):**

3. **A-1 (Kritisch) — BEHOBEN:** Sonden-Filter werden jetzt über `passed_probes.rds` auf
   DMP/DMR/Heatmap angewendet (unabhängig verifiziert).
4. **B-1 (Hoch) — BEHOBEN:** Compose-Default `DMR_CORES=1`.
5. **N-1 (Hoch) — BEHOBEN:** r_worker mit fixem `container_name`.

---

## 1. Kritisch

### A-1 · Sonden-Filter werden gemeldet, aber nie auf die Analyse angewendet
- [x] **Priorität:** Kritisch — **BEHOBEN** (Umsetzung s. „Status" am Ende dieses Punktes)
- **Betroffene Dateien:** `r_backend/init_filter.R` (`run_filtering`, ~646–767; Header 20–27),
  `r_backend/normalize.R`, `backend/app/services/r_executor/commands/commands.py`
  (`BetaExtractionCommand`), `backend/app/services/batch_service.py`
  (`run_downstream_analysis_task`), `r_backend/dmp.R`, `r_backend/dmr.R`, `r_backend/heatmap.R`,
  `frontend/app/src/shared/help/content/filtering.md`, `docs/architecture/r_backend-architecture.md` (§8.1)
- **Beschreibung:** `init_filter.R` berechnet die überlebenden Sonden (`probe_keep`) nach den
  Sonden-Filtern (Detection-P, Bead, Non-CpG, SNP, Multi-Hit, XY), schreibt aber nur **Zähler**
  in `filter_stats.json`. Gespeichert wird `filtered_data.rds` = vollständiges `RGChannelSet`
  (nur Samples gefiltert, **alle** Sonden). Die gesamte Downstream-Kette
  (`normalize.R` → `getBeta` → `beta.rds` → DMP/DMR/Heatmap) nutzt **alle** Sonden; nur
  konstante/NA-Zeilen entfernt `drop_invariant_probes`. Der Sonden-Satz wird nirgends
  persistiert oder erneut angewendet. **Nur der Sample-Quality-Filter wirkt** (er entfernt ganze
  Samples aus dem gespeicherten `RGChannelSet`).
- **Begründung:** Der Nutzer-Hilfetext (`filtering.md`) sagt wörtlich *„Filtering removes
  low-quality probes and samples **before** normalization and statistical testing"* und je
  Filter *„A probe is removed if …"*; der `init_filter.R`-Header behauptet *„probe selections …
  applied downstream after normalization"*. Beides ist faktisch falsch. Fachlich (Standard-ChAMP)
  erwartet man, dass z. B. XY- oder SNP-Sonden aus DMP/DMR/Heatmap ausgeschlossen sind — sie
  bleiben aber drin. Direkt sichtbar: `filter_stats.json` meldet `total_end`, die DMP-Tabelle
  enthält aber ~`total_start` Zeilen. Das ist die einzige **fachliche Korrektheitslücke** im
  Projekt.
- **Lösung (Intention zuerst klären):**
  - **Bevorzugt (korrekt):** In `init_filter.R` die überlebenden Sonden-IDs persistieren (z. B.
    `passed_probes.txt`) und die Beta-Matrix vor DMP/DMR/Heatmap darauf einschränken (je eine
    Subset-Zeile in `BetaExtractionCommand` bzw. nach `batch_correct`). → **mittel.**
  - **Minimal (Ehrlichkeit):** Hilfetext, `init_filter.R`-Header und `r_backend-architecture.md`
    §8.1 auf „nur Statistik/Vorschau, keine Anwendung" korrigieren und in der UI ausweisen. →
    gering, schließt aber nur die Irreführung, nicht die fachliche Lücke.
- **Aufwand:** mittel
- **Querverweis:** T-1 (kein Test durchläuft den Filter-Anwendungspfad).
- **Status (behoben):** Umgesetzt über die bevorzugte, korrekte Variante:
  1. `init_filter.R` gibt die überlebenden Sonden-IDs (`passed_probes`) aus `run_filtering` zurück
     und persistiert sie als `passed_probes.rds` (neben `filtered_data.rds`, das für die
     Normalisierung weiterhin alle Sonden behält).
  2. Neuer, defensiver Utility-Helfer `restrict_to_passed_probes(beta, job_dir)` in
     `r_backend/utils/beta.R` (fehlende/leere/inkompatible Auswahl → Matrix unverändert, nie
     Abbruch).
  3. `dmp.R` und `dmr.R` schränken ihre Beta-Matrix direkt nach dem Laden auf `passed_probes.rds`
     ein — unabhängig davon, wie `beta.rds` entstand (Skip-Batch, Batch-korrigiert, RAW). Die
     Heatmap ist dadurch **transitiv** abgedeckt (sie wählt CpGs aus der bereits gefilterten
     DMP-Tabelle).
  4. Doku-Vertrag angeglichen: `r_backend-architecture.md` (§6/§7/§8.1/§8.6/§8.7) und der
     `init_filter.R`-Header; `frontend/.../help/content/filtering.md` korrekt formuliert.
  5. Tests: 5 neue Unit-Tests für `restrict_to_passed_probes` in `tests/utils/test_beta.R`
     (verhaltensverifiziert im R-Worker-Container, inkl. echter 930k-Sonden-Matrix) und zwei
     Contract-Assertions im Integrationstest (`passed_probes.rds` existiert; jede analysierte
     DMP-Sonde liegt in der Auswahl). T-1 ist damit auf Unit-/Contract-Ebene abgedeckt; ein
     Voll-Lauf mit *aktivem* Filter bleibt fixture-abhängig.

---

## 2. Hoch

### P-1 · Leeres/relatives `JOB_BASE_DIR` → relativer `staging`-Pfad → `PermissionError` (real aufgetreten)
- [ ] **Priorität:** Hoch
- **Betroffene Dateien:** `backend/app/core/config.py:68` und `:79`,
  `backend/app/services/staging_manager.py:28–31`, `backend/app/services/file_handler.py:15`,
  `backend/app/services/job_paths.py:17`, `backend/Dockerfile:14/16/23`,
  `docker-compose.yml` (backend-Service ohne `read_only`, aber `user: "1000:1000"`)
- **Symptom (gemeldeter Incident):** Beim `POST /api/v1/upload/inspect`:
  `PermissionError: [Errno 13] Permission denied: 'staging'` in `staging_manager._base_dir()` bei
  `STAGING_BASE_DIR.mkdir(...)`.
- **Ursache (exakte Kette):**
  1. `config.py:79`: `STAGING_BASE_DIR = Path(os.environ.get("JOB_BASE_DIR", "/app/jobs")) / "staging"`.
  2. `os.environ.get(k, default)` liefert bei **present-but-empty** (`JOB_BASE_DIR=`) den
     **leeren String** `""` zurück — **nicht** den Default (`.get` greift den Default nur bei
     *fehlendem* Schlüssel, nicht bei leerem Wert).
  3. `Path("") / "staging"` == `PosixPath("staging")` — ein **relativer** Pfad (verifiziert).
  4. `STAGING_BASE_DIR.mkdir(...)` legt daher `staging` **relativ zum CWD** an. Im Container ist
     CWD `/app`; `/app` gehört `root` (`WORKDIR /app` erzeugt es als root), der Prozess läuft als
     `uid 1000` (`docker-compose: user: "1000:1000"`) → kein Schreibrecht in `/app` → `EACCES`.
  Der schreibbare Bind-Mount ist nur `/app/jobs` (aus `./jobs`); ein absoluter
  `/app/jobs/staging` würde funktionieren, der relative `/app/staging` nicht.
- **Begründung / Schwere:** Wird `JOB_BASE_DIR` irgendwo leer gesetzt (leere `.env`-Zeile,
  `-e JOB_BASE_DIR=`, k8s `value: ""`, Shell-Export), ist **die komplette Anwendung unbrauchbar**
  (kein Upload, keine Jobs). Der ausgelieferte Compose-Default `${JOB_BASE_DIR:-/app/jobs}` fängt
  den Leerwert zwar ab — der Code selbst tut es aber **nicht**, und genau abseits des
  Standard-Compose-Pfades ist der Incident aufgetreten. Zusätzlich verschärfend: zwei
  **widersprüchliche Defaults** für dieselbe Variable (siehe Abschnitt 7).
- **Lösung (klein, gebündelt):** `JOB_BASE_DIR` in `config.py` **einmal** über einen Helfer lesen,
  der (a) leere/whitespace-Werte wie „nicht gesetzt" behandelt, (b) **einen** absoluten Default
  (`/app/jobs`) verwendet und (c) auf einen absoluten Pfad auflöst; `STAGING_BASE_DIR` daraus
  ableiten (`JOB_BASE_DIR / "staging"`), **nicht** erneut aus der Env lesen. Details und alle
  gleichartigen Stellen in **Abschnitt 7**.
- **Aufwand:** gering

### B-1 · `DMR_CORES`-Default in docker-compose ist 4 (OOM-Risiko, widerspricht Code/Doku)
- [x] **Priorität:** Hoch — **BEHOBEN**
- **Betroffene Dateien:** `docker-compose.yml:74`, `backend/app/core/config.py:96` (Default `1`),
  `docs/backend/configuration.md`, `docs/deployment/docker.md`
- **Beschreibung:** Der ausgelieferte Compose-Default ist `DMR_CORES=${DMR_CORES:-4}`, während
  Code-Default, gesamte Doku und die dokumentierte OOM-Analyse `1` vorgeben. `champ.DMR` hält je
  Bootstrap-Worker eine volle Kopie der Beta-Matrix; bei 4 Workern ~11–14 GiB.
- **Begründung:** Die Governor-Schätzung `PIPELINE_DMR_MEMORY_GB=6` und das harte
  `R_WORKER_MEM_LIMIT=10g` gehen von ~1 Core aus. Der Governor lässt DMR mit 6 GiB zu, real
  sprengt es das 10-GiB-Limit → cgroup-OOM-Kill → Job scheitert. Genau das Szenario, das laut
  Projekt-Historie bereits behoben war, wird durch den Compose-Default reaktiviert. `cores` an
  `dmr.R` (= `str(DMR_CORES)`) wird **nicht** vom Core-Budget begrenzt.
- **Lösung:** In `docker-compose.yml` auf `DMR_CORES=${DMR_CORES:-1}` setzen.
- **Aufwand:** gering
- **Status (behoben):** `docker-compose.yml` liefert jetzt `DMR_CORES=${DMR_CORES:-1}` (mit
  Kommentar-Begründung); `docker compose config` rendert effektiv `DMR_CORES: "1"`. Ein
  Operator-Override (`DMR_CORES=…`) bleibt möglich. Regressionstest in
  `backend/tests/test_deploy_config.py` verankert „Compose-Default == 1".

### N-1 · R-Worker-Container-Name hartkodiert und in Compose nicht fixiert
- [x] **Priorität:** Hoch — **BEHOBEN**
- **Betroffene Dateien:** `backend/app/services/r_executor/commands/base.py:34`
  (`R_WORKER_CONTAINER = "swtp-ss26-bigtom-r_worker-1"`), `docker-compose.yml` (r_worker-Service
  ohne `container_name`), `docs/architecture/r-executor.md:109`
- **Beschreibung:** Das Backend adressiert den R-Worker per `docker exec <fester Name>`. Der
  Name folgt der Compose-Default-Konvention `<projekt>-<service>-<index>`, wobei `<projekt>`
  standardmäßig der **Verzeichnisname** ist. Der r_worker-Service setzt **kein** `container_name`
  (der `docker-socket-proxy` dagegen schon).
- **Begründung:** Wird das Repo in ein anders benanntes Verzeichnis geklont oder
  `COMPOSE_PROJECT_NAME` gesetzt, ändert sich der Container-Name → jeder `docker exec` scheitert
  mit „No such container" → **die komplette R-Pipeline funktioniert nicht** (jeder Schritt
  schlägt sofort fehl). Unter dem Default-Checkout (`swtp-ss26-bigtom`) funktioniert es zufällig;
  die Kopplung ist aber fragil und unüblich.
- **Lösung:** Dem r_worker-Service in `docker-compose.yml` ein festes
  `container_name: swtp-ss26-bigtom-r_worker-1` geben (minimal, konsistent zum socket-proxy) —
  oder `R_WORKER_CONTAINER` per `os.getenv` konfigurierbar machen und in Compose setzen.
- **Aufwand:** gering
- **Status (behoben):** Der r_worker-Service hat jetzt ein fixes
  `container_name: swtp-ss26-bigtom-r_worker-1` (verzeichnis-/projektnamen-unabhängig, konsistent
  zum `docker-socket-proxy`); `docker compose config` bestätigt den effektiven Namen. Die
  hartkodierte Konstante in `base.py` trägt eine erläuternde Notiz zur Kopplung. Regressionstest
  in `backend/tests/test_deploy_config.py` verankert `r_worker.container_name ==
  RCommand.R_WORKER_CONTAINER`.

### R-1 · 🆕 NEU (Revision 4) · Voll-CSV-Read pro Request in Tabellen-/Heatmap-Schicht → Backend-OOM
- [ ] **Priorität:** Hoch (neuer Befund, nicht in vorherigen Revisionen)
- **Betroffene Dateien:** `backend/app/services/table_handler.py:50` (`load_dataframe` →
  `pd.read_csv`), `:167–169` (`export_table_csv` → `StringIO` + `df.to_csv`),
  `backend/app/services/heatmap_service.py:97` (`prepare_heatmap_input` → `pd.read_csv`);
  Kontext: `docker-compose.yml` (`BACKEND_MEM_LIMIT` Default **1g**),
  `backend/app/core/resource_governor.py` (deckt **nur** R-Schritte ab).
- **Beschreibung / Ursache:** Jeder Tabellen-Request (Seite, Filter, Sortierung) und jeder
  CSV-Export liest die **vollständige** Ergebnisdatei per `pd.read_csv` neu ein — **kein Cache,
  kein Streaming**. Gefiltert und sortiert wird auf der kompletten DataFrame; erst danach wird
  auf 75 Zeilen paginiert. `prepare_heatmap_input` liest dieselbe große Datei bei **jeder**
  Heatmap-Erzeugung erneut ein. Keiner dieser Pfade ist durch den Resource-Governor gedeckt.
- **Reproduzierbar / Zahlen (verifiziert):** Eine echte EPICv2-`dmp_results.csv` ist **140 MB /
  936 882 Zeilen** (im Repo unter `jobs/` vorhanden). Als pandas-DataFrame (mehrere Objekt-/
  String-Spalten: `ID, GENE, CHR, FEATURE, CGI, DMR_ID`) belegt das grob **0,4–0,7 GB** RAM;
  `export_table_csv` baut zusätzlich den **kompletten** CSV-String im Speicher
  (`StringIO.getvalue`, ~140 MB + Kopie). Schon ein **einzelner** ungefilterter EPICv2-Export
  nähert sich damit dem 1-GB-Limit; ein paralleler Tabellen-/Heatmap-Request schiebt es darüber.
- **Risiko:** Überschreitet das Backend sein hartes `mem_limit` (1g), greift der cgroup-OOM-Killer.
  Da der **Job-Zustand ausschließlich im Speicher** liegt (bewusste DSGVO-Entscheidung, siehe
  projekt-overview §5.4/§10), gehen bei einem Backend-OOM **alle laufenden Sitzungen** verloren —
  nicht nur der auslösende Request. Das untergräbt genau die OOM-Härtung, die der Resource-Governor
  für die R-Schritte bietet. Fällt bei kleinen Kohorten nicht auf, ist mit großem Array (EPICv2)
  und dem dokumentierten Mehrbenutzerbetrieb aber real reproduzierbar.
- **Empfehlung (klein, keine Architekturänderung):**
  1. **Pro-Job-Cache** der geparsten DataFrame (kleiner LRU, Schlüssel `job_id`+`table`+Datei-`mtime`),
     sodass wiederholtes Paginieren/Sortieren/Filtern **einen** Parse wiederverwendet statt N je
     Klick. Begrenzt den Speicher auf ~eine DataFrame je aktivem Job.
  2. **Export streamen** (`StreamingResponse`, chunk-weises `to_csv`) statt den gesamten CSV-String
     im Speicher zu bilden — bzw. die gecachte DataFrame wiederverwenden.
  3. Optional: `BACKEND_MEM_LIMIT` anheben und/oder den Tabellen-/Export-Pfad in eine leichte
     Zulassungsschranke aufnehmen.
- **Aufwand:** gering–mittel

---

## 3. Mittel

### C-1 · Gebrochene Doku-Links auf gelöschte `docs/HTTPS.md`
- [x] **Priorität:** Mittel — **BEHOBEN**
- **Betroffene Dateien:** `docs/architecture/backend-architecture.md:296`,
  `docs/backend/security.md:238`, `docs/deployment/https-nginx.md:27`
- **Beschreibung:** `docs/HTTPS.md` ist gelöscht (git: `D docs/HTTPS.md`), wird aber an drei
  Stellen noch als `[HTTPS.md](../HTTPS.md)` bzw. im Fließtext referenziert.
- **Begründung:** Tote Links auf die TLS-/Zertifikat-Anleitung; sichtbarer Qualitätsmangel für
  eine Abgabe.
- **Lösung:** Verweise auf `docs/deployment/https-nginx.md` umbiegen bzw. Erwähnung entfernen.
- **Aufwand:** gering
- **Status (behoben):** Die beiden Verweise in `backend-architecture.md` und `security.md` zeigen
  jetzt auf `../deployment/https-nginx.md`; die Selbst-Referenz in `https-nginx.md` verweist für die
  konkreten `mkcert`-Befehle auf den Repository-README (`../../README.md`), in dem diese Anleitung
  liegt. Keine `HTTPS.md`-Referenz mehr in `docs/`.

### C-2 · `DMR_CORES`-Default in Doku = 4 (statt 1)
- [x] **Priorität:** Mittel — **BEHOBEN**
- **Betroffene Dateien:** `docs/architecture/r_backend-architecture.md:107`
- **Beschreibung:** Der Text nannte Default `4`; Code (`config.py`) und alle übrigen Doku-Dateien
  nennen `1`. (Die frühere Zweit-Referenz `docs/documentation-checklist.md` existiert nicht mehr.)
- **Begründung:** Widersprüchliche Doku zu einem stabilitätsrelevanten RAM-Parameter (siehe B-1).
- **Lösung:** Auf `1` korrigieren.
- **Aufwand:** gering
- **Status (behoben):** `r_backend-architecture.md:107` nennt jetzt Default `1`, konsistent zu
  `config.py`, `docs/backend/configuration.md` und `docs/deployment/docker.md`.

### C-3 · `.env.example` listet nicht-konfigurierbares `STAGING_BASE_DIR`
- [ ] **Priorität:** Mittel
- **Betroffene Dateien:** `.env.example:13`, `backend/app/core/config.py:79`,
  `docs/backend/configuration.md:78`
- **Beschreibung:** `config.py` leitet `STAGING_BASE_DIR` immer aus `JOB_BASE_DIR + "/staging"`
  ab; eine Umgebungsvariable wird ignoriert. `configuration.md:78` sagt das korrekt
  („is not a configurable variable"), `.env.example` widerspricht dem mit `STAGING_BASE_DIR=/app/staging`.
- **Begründung:** Stille Fehlkonfiguration (gesetzter Wert wirkt nicht); interner Widerspruch
  zwischen zwei Projekt-Artefakten.
- **Lösung:** Zeile aus `.env.example` entfernen oder als „abgeleitet, nicht setzbar" markieren.
- **Aufwand:** gering

### N-2 · Heatmap-CpG-Limit: Backend erzwingt 500, R-Default/Doku sagen 1000
- [x] **Priorität:** Mittel — **BEHOBEN (Doku)**
- **Betroffene Dateien:** `backend/app/services/heatmap_service.py:24` (`MAX_CPGS = 500`),
  `r_backend/heatmap.R:25` (`HEATMAP_MAX_ROWS` Default `1000`),
  `docs/architecture/r_backend-architecture.md` (§4.3, Tabelle „1000")
- **Beschreibung:** Das Backend begrenzt die CpG-Auswahl auf 500 (`prepare_heatmap_input` wirft
  400 bei > 500) und übergibt `HEATMAP_MAX_ROWS=500` an R. Der R-Default `1000` wird dadurch nie
  wirksam; Doku und R-Header nennen aber 1000 als „hard limit".
- **Begründung:** Das tatsächlich nutzerwirksame Limit (500) weicht von der dokumentierten Zahl
  (1000) ab — irreführend; zusätzlich eine still divergierende Magic-Number an zwei Orten.
- **Lösung:** Doku und den R-Default-Kommentar auf 500 angleichen (bzw. den Backend-Override
  dokumentieren).
- **Aufwand:** gering
- **Status (behoben, Doku-Seite):** `r_backend-architecture.md` §4.3 dokumentiert jetzt den
  Backend-Override: der R-Default bleibt korrekt `1000` (nur beim Standalone-Lauf wirksam), das
  effektive nutzerseitige Limit ist `500` (`MAX_CPGS`). Der R-Header-Kommentar (`heatmap.R:25`) ist
  Code und wurde in diesem Doku-Review nicht angefasst.

---

## 4. Niedrig

### C-4 · `configuration.md` intern widersprüchlich zu `STAGING_RETENTION_HOURS`
- [x] **Priorität:** Niedrig — **BEHOBEN**
- **Betroffene Dateien:** `docs/backend/configuration.md:75` (Default `2`) vs. `:188`
  („default 8h")
- **Beschreibung:** Dieselbe Datei nannte zwei verschiedene Defaults; Code (`config.py`) ist `2`.
- **Begründung:** Widersprüchliche Doku (parenthetischer Fehler in der Validator-Tabelle).
- **Lösung:** Zeile 188 auf `2` korrigieren.
- **Aufwand:** gering
- **Status (behoben):** Die falsche, zudem einzige Default-Klammer „(default 8h)" in der
  Validator-Tabelle wurde entfernt; der maßgebliche Default (`2`) steht weiterhin in der
  Haupttabelle (Zeile 75). Kein Widerspruch mehr.

### D-1 · Inkonsistente Behandlung von 1-Sample-Gruppen: DMP vs. DMR
- [ ] **Priorität:** Niedrig
- **Betroffene Dateien:** `r_backend/dmr.R:87–110` (`build_two_group_design`, fabriziert eine
  synthetische Quasi-Replik), `r_backend/dmp.R:246–252` (Fehler bei < 2 Samples/Gruppe)
- **Beschreibung:** Bei einer 1-Sample-Gruppe fabriziert DMR eine verrauschte Kopie, DMP bricht
  ab. Da DMR **vor** DMP läuft und beide im selben Analyse-Task laufen, scheitert der Job am Ende
  ohnehin bei DMP → die DMR-Fabrikation ist wirkungslos und inkonsistent. `set.seed(42)` steht
  zudem innerhalb der Gruppen-Schleife.
- **Begründung:** Uneinheitliches Verhalten; erzeugt nie genutzte, fachlich fragwürdige
  Zwischenergebnisse.
- **Lösung:** DMR ebenfalls klar bei < 2 Samples/Gruppe abbrechen (konsistent zu DMP), oder die
  Fabrikation entfernen; `set.seed` aus der Schleife ziehen.
- **Aufwand:** gering

### D-3 · Frontend-Polling: erster Fehlversuch ohne Vorstatus zeigt keinen Fehler
- [ ] **Priorität:** Niedrig
- **Betroffene Dateien:** `frontend/app/src/shared/hooks/useJobPolling.ts:93–108`
- **Beschreibung:** Schlägt schon der erste Status-Poll `MAX_CONSECUTIVE_FAILURES`-mal fehl
  (z. B. sofortiges 404), ist `previous === null` → `setJobStatus` bleibt `null` und das Polling
  stoppt ohne sichtbaren Fehlerzustand.
- **Begründung:** UI kann in „lädt ewig ohne Meldung" hängen. Randfall.
- **Lösung:** Auch bei `previous === null` einen synthetischen Verbindungsfehler-Status erzeugen.
- **Aufwand:** gering

### D-6 · Ungenutztes Feld `recommended` an `SampleSheetCandidate`
- [ ] **Priorität:** Niedrig
- **Betroffene Dateien:** `backend/app/models/upload.py:58`,
  `backend/app/services/upload_inspect_service.py`
- **Beschreibung:** `recommended` wird nie gesetzt (immer `False`).
- **Begründung:** Toter Vertragsanteil.
- **Lösung:** Feld entfernen oder befüllen.
- **Aufwand:** gering

---

## 5. Testlücken

### T-1 · Sonden-Filter-Anwendung wird end-to-end nie getestet
- [ ] **Priorität:** Hoch (Ursache dafür, dass A-1 unentdeckt blieb)
- **Betroffene Dateien:** `r_backend/tests/test_pipeline_integration.R:155` (ruft `init_filter.R`
  **ohne** `filter_settings.json` → alle Filter aus)
- **Beschreibung:** Kein Test aktiviert einen Sonden-Filter und prüft, dass die betroffenen
  Sonden (z. B. `chrX`/`chrY` bei aktivem XY-Filter) in DMP/DMR/Heatmap fehlen. Der
  Integrationstest prüft nur „Sonden > 0".
- **Lösung:** Regressionstest mit aktivem XY-/SNP-Filter ergänzen, der den Ausschluss im Ergebnis
  verifiziert (deckt A-1 ab).
- **Aufwand:** mittel

### T-2 · Kernlogik von `heatmap.R` ist nicht in testbaren Funktionen
- [ ] **Priorität:** Mittel
- **Betroffene Dateien:** `r_backend/heatmap.R:70–694` (gesamte Logik im
  `if (sys.nframe() == 0L)`-Block)
- **Beschreibung:** Anders als alle übrigen Skripte kapselt `heatmap.R` seine ~600 Zeilen
  (Beta-Extraktion, Sentrix→Sample-Mapping, Fallback-Pfade, Sortierung) nicht in Funktionen;
  getestet ist nur `utils/heatmap_anno.R`. Die riskanten Mapping-Zweige (247–330) sind
  ungetestet.
- **Begründung:** Fehleranfälligste Nicht-Analyse-Logik ohne Testabdeckung.
- **Lösung:** Für die Abgabe mindestens die Mapping-Helfer (Sentrix-Auflösung, group-avg-Modus)
  in Funktionen ziehen und je einen Testfall ergänzen (keine größeren Umbauten).
- **Aufwand:** mittel

---

## 6. Gesamtbewertung

### 6.1 Besonders gut umgesetzt
- **Sicherheits-Envelope des Uploads:** `archive_utils.py` (Zip-Slip/Zip-Bomb/Symlink-Abwehr,
  Streaming mit Größen-Caps), zentrale `upload_limits.py`, konsequente Pfad-Traversal-Guards
  (`job_paths.py`, `staging_manager.py`) und UUID-Validierung.
- **Robustheit der Nebenläufigkeit:** Reset-/Cancel-Lebenszyklus (`reset_service.py`,
  `pipeline_task.py`, R-Executor-Kill-Pfad), atomare JSON-Persistenz (`atomic_io.py`),
  bewachte State-Machine (`job_manager.py`).
- **R-Utility-Schicht:** saubere, getestete, gut dokumentierte Einzelverantwortungen
  (`beta.R`, `samplesheet.R`, `arraytype.R` inkl. EPICv2-Rekonstruktion, `columns.R`, `stats.R`).
- **Fehlerkontrakt:** durchgängiges RFC-9457-Format, defensives Frontend-Parsing (`apiError.ts`,
  `useJobPolling.ts`), konsistente Wertebereiche zwischen Frontend, Pydantic-Modellen und
  R-Validierung.
- **Ressourcen-/Sicherheits-Härtung:** Socket-Proxy, isolierte Netze, `read_only`/`cap_drop`,
  nginx-Rate-Limiting, Resource-Governor. (Die Härtung ist konzeptionell stark — nur die
  Compose-Defaults B-1/N-1 unterlaufen sie.)

### 6.2 Größte Risiken für die Abgabe
Behoben und re-validiert: **A-1** (Filter werden angewendet), **B-1** und **N-1** (Compose-Defaults).
Verbleibende Hoch-Risiken:

1. **P-1 (Hoch, bereits eingetreten):** Die Konfig-/Pfad-Robustheit (Abschnitt 7) hat real zum
   Totalausfall geführt. Kleiner, aber wichtiger Fix, weil er eine ganze Fehlerklasse schließt.
2. **R-1 (Hoch, neu):** Ungecachter Voll-CSV-Read in der Tabellen-/Heatmap-Schicht kann das
   Backend über sein 1-GB-Limit treiben (EPICv2). Ein Backend-OOM verwirft **alle** In-Memory-
   Sitzungen — dieselbe Klasse „Totalausfall", die der Resource-Governor sonst verhindert, aber
   auf dem ungeschützten Backend-Pfad.
3. **Test-/Doku-Vertrauen:** T-1 zeigt, dass ein zentraler Pfad end-to-end ungetestet ist; von den
   Doku-Fehlern sind C-1, C-2, C-4 und N-2 (Doku-Seite) inzwischen behoben, offen bleibt nur C-3
   (`.env.example` listet das nicht-konfigurierbare `STAGING_BASE_DIR`) — trivial behebbar.

### 6.3 Produktionsreife – Einschätzung
**Nicht uneingeschränkt produktionsreif im aktuellen Zustand — aber sehr nah dran.** Die
Architektur, die Sicherheits-Härtung und die Code-Qualität liegen deutlich über
Studienprojekt-Niveau und sind für ein internes, vertrauenswürdiges Netz grundsätzlich tragfähig.

Bereits behoben (Revision 4 re-validiert): **A-1** (die fachliche Korrektheitslücke — Filter
werden jetzt angewendet), **B-1** und **N-1** (die zwei Deploy-Default-Fehlerquellen).

Gegen „produktionsreif" sprechen im aktuellen Zustand noch:
- **P-1** ist bereits real eingetreten und legt die Anwendung im betroffenen Deploy vollständig
  lahm; die zugrunde liegende Konfig-/Pfad-Behandlung (Abschnitt 7) ist zu härten.
- **R-1** (neu) kann das Backend bei großen Ergebnissen (EPICv2) über sein Speicherlimit treiben;
  ein Backend-OOM verwirft alle In-Memory-Sitzungen. Ohne Cache/Streaming ist ein zuverlässiger
  Mehrbenutzerbetrieb mit großen Arrays nicht garantiert.

Nach Behebung von **P-1** und **R-1** (beide gering–mittel) sowie der letzten trivialen
Doku-Korrektur (C-3) ist das Projekt aus Sicht dieses Reviews **abgabe- und für den vorgesehenen
internen Einsatz betriebsreif**. Die verbleibenden Niedrig-Punkte sind Politur und blockieren die
Abgabe nicht.

---

## 7. Pfad-/Env-Robustheit – Fehlerklasse aus dem gemeldeten Incident

Der `PermissionError: 'staging'`-Incident (P-1) ist kein Einzelfall, sondern Symptom einer
**Fehlerklasse**: Konfiguration wird an mehreren Stellen so gelesen, dass ein **leerer** oder
**relativer** Wert stillschweigend einen kaputten Pfad erzeugt bzw. den Prozess-Start abbricht.
Diese Suche listet **alle** gleichartigen Stellen und den gebündelten Fix.

### 7.1 Konkrete Fundstellen (alle verifiziert)

| # | Ort | Muster | Effekt bei leerem/relativem Wert |
|---|---|---|---|
| a | `config.py:79` | `Path(os.environ.get("JOB_BASE_DIR", "/app/jobs")) / "staging"` | Leerer Wert → `Path("")` → **relativer** `staging`-Pfad → `mkdir` scheitert (P-1). |
| b | `config.py:68` | `Path(os.getenv("JOB_BASE_DIR", "./jobs"))` | **Relativer** Default `./jobs` (nicht `/app/jobs`) — schon der Default ist für einen Container falsch; leerer Wert → `Path("")` = `.` → Jobs landen relativ zum CWD. |
| c | `config.py:68` vs `:79` | zwei Defaults für **dieselbe** Variable: `./jobs` vs `/app/jobs` | Bei fehlendem `JOB_BASE_DIR` liegen Jobs unter `./jobs`, Staging unter `/app/jobs/staging` — **zwei verschiedene Basisverzeichnisse**. |
| d | `config.py:12–59` (`_get_positive_int/_float`, `_get_nonneg_*`) | `int(os.getenv(name, str(default)))` | Leerer Wert (`KEY=`) → `int("")`/`float("")` → `ValueError` beim **Import** → Backend startet nicht (verifiziert). Betrifft `DMR_CORES`, `JOB_RETENTION_HOURS`, alle `PIPELINE_*`, `MAX_*`. |
| e | `job_paths.py:17` vs `file_handler.py:15` | `JOBS_DIR = JOB_BASE_DIR.resolve()` (absolut) vs `UPLOAD_BASE_DIR = JOB_BASE_DIR` (roh) | Zwei Ableitungen desselben Basispfads divergieren, sobald `JOB_BASE_DIR` relativ/leer ist. |
| f | `Dockerfile:14/16/23` + `docker-compose.yml` | `WORKDIR /app` (root-owned) + `adduser --system app` (uid ≠ 1000) + Compose `user: "1000:1000"` | `/app` und die kopierten Dateien gehören **nicht** uid 1000 → jeder relative Schreibzugriff ins CWD scheitert. Das ist der Grund, warum P-1 als *Permission*-Fehler (statt „falsches Verzeichnis") auftritt. |

Nicht betroffen (zur Abgrenzung): `atomic_io.py:26`, `archive_utils.py:106`,
`upload_inspect_service.py:171` legen nur das **Elternverzeichnis eines bereits korrekten Ziels**
unterhalb eines Job-/Staging-Dirs an — sie erben die Basispfad-Korrektheit. `logging_config.py:17`
behandelt einen leeren `LOG_LEVEL` sauber (Fallback INFO). Die R-Skripte und nginx verwenden
ausschließlich **absolute** Pfade (`/app/...`, `/tmp/...`) und sind nicht betroffen.

### 7.2 Gebündelte Lösung (klein, ein Ort)

1. **Einen robusten Pfad-Helfer in `config.py`** einführen und für `JOB_BASE_DIR` nutzen:
   ```python
   def _get_base_dir(name: str, default: str) -> Path:
       raw = (os.getenv(name) or "").strip()        # leer/whitespace == nicht gesetzt
       return Path(raw or default).resolve()         # ein absoluter Default, absolut aufgelöst
   JOB_BASE_DIR = _get_base_dir("JOB_BASE_DIR", "/app/jobs")
   ```
   Damit sind (a), (b) und (c) erledigt: **ein** absoluter Default, leer == Default.
2. **`STAGING_BASE_DIR` aus der geparsten Variable ableiten**, nicht erneut aus der Env lesen:
   `STAGING_BASE_DIR = JOB_BASE_DIR / "staging"`. (behebt P-1 direkt)
3. **`UPLOAD_BASE_DIR` = `JOBS_DIR`** verwenden (bzw. beide aus `JOB_BASE_DIR.resolve()`), damit
   `file_handler` und `job_paths` denselben absoluten Basispfad nutzen. (behebt (e))
4. **Numerische Helfer leer == Default** behandeln: in `_get_positive_*`/`_get_nonneg_*` vor der
   Konvertierung `raw = raw.strip(); if not raw: raw = str(default)`. (behebt (d))
5. **Optional als Defense-in-Depth (Deploy):** im `Dockerfile` das Arbeitsverzeichnis dem
   Laufzeit-User geben (`RUN mkdir -p /app/jobs && chown -R 1000:1000 /app`) oder die uid des
   `app`-Users fix auf 1000 setzen und in Compose konsistent verwenden, damit auch ein
   versehentlich relativer Schreibzugriff nicht als kryptischer `EACCES` endet. (mildert (f))

**Aufwand:** gering (alle Änderungen liegen in `config.py`, plus je eine Zeile in
`file_handler.py`/`Dockerfile`). **Priorität der Sammelmaßnahme:** Hoch — schließt die Ursache von
P-1 **und** den Startup-Crash (d) in einem Zug.
