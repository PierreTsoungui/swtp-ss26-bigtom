# Changelog

Alle wesentlichen Änderungen dieses Projekts werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/)
und diese Auszeichnung folgt der [Semantischen Versionierung](https://semver.org/lang/de/).

## [0.3.0] - 2026-06-06

### Added
- **DMP/DMR-Analyse:** Implementierung der DMP-Analyse (Differentially Methylated Positions) und DMR-Analyse (Differentially Methylated Regions).
- **Batch-Korrektur:** Vollständiger Workflow für Batch-Korrekturen inklusive dynamischer Auswahl von Batch-Variablen, SVD-Visualisierung vor und nach der Korrektur sowie Protokollierung mehrerer Batch-Korrekturrunden.
- **Ergebnistabellen:** Bereitstellung mehrerer Tabellenansichten mit serverseitiger Pagination, Sortierung, Filterung und erweiterter Tabellennavigation.
- **Benutzeroberfläche:** Verbessertes globales Layout, optimierte Navigation sowie erweiterte Statusanzeigen und Benutzerführung.
- **Export:** Funktionalität zum CSV/TSV-Export von Analyseergebnissen und PNG-Export für generierte Diagramme.

## [0.2.0] - 2026-05-22

### Added
- **Initiale Filterung (US-9):** Implementierung der initialen Datenfilterung im R-Backend sowie Speicherung und Abruf von Filterstatistiken.
- **Filterstatistik (US-12):** Backend-Endpunkte für Filterstatistiken und Frontend-Darstellung der Filterergebnisse.
- **Progress Bar (US-11):** Fortschrittsanzeige für laufende Analyseprozesse via Status-Polling zwischen Frontend und Backend.
- **Normalization Preview (US-13, US-14, US-15):** Vorschau verschiedener Normalisierungsmethoden (BMIQ, FUNNORM, QUANTILE u.a.) inklusive Darstellung von Density- und PCA-Plots sowie neuer Frontend-Seite für den Methodenvergleich.
- **Normalisierung (US-16, US-17):** API-Endpunkt zur Auswahl und Bestätigung der Normalisierung inklusive Integration von R-Skripten zur automatischen Verarbeitung.
- **Ergebnistabelle (US-18):** Dynamische Ergebnistabelle mit Sortierung und Ladezuständen, integriert in die Benutzeroberfläche.
- **Table Handler (US-19):** Serverseitige Pagination für große Datensätze über die neue API-Route `/table`.
- **Analyseabbruch (US-23):** Neuer Endpunkt `POST /api/v1/reset/{job_id}` zum Abbrechen laufender Analysen aus dem Frontend.

### Changed
- Fehlerformat an API-Vertrag angepasst (einheitliche Fehlerstruktur).
- Verbesserte File-Validierung mit API-konformer Fehlerrückgabe.
- Überarbeitung der Normalisierungs-Pipeline im R-Backend.
- Verbesserte Statusverwaltung von Analysejobs.
- Bereinigung der `.gitignore`-Struktur (zentralisiert im Root-Verzeichnis).

### Fixed
- Korrekte Generierung aller Normalisierungs-Plots (FUNNORM, QUANTILE).
- Fehler bei PNG-Erzeugung unter Docker behoben (`pthread_create`-Fehler).
- Fehlerhafte API-URLs im Frontend korrigiert.
- Anzeige von Filterstatistiken repariert.
- Stabilere Kommunikation zwischen Frontend und R-Backend.

## [0.1.0] - 2026-05-08

### Added
- **Projektgrundlage:** Initiale Projektstruktur mit React-Frontend (React Router), FastAPI-Backend und Docker-Umgebung samt NGINX-Konfiguration.
- **Datei-Upload (US-2):** Upload von IDAT-Dateien und Sample Sheets inklusive Validierung mit Magic Numbers, Frontend-Komponente, Custom Hook für API-Aufrufe und Vitest-Tests.
- **Job-System:** Einführung des Job-Datenmodells (`job.py`), Implementierung der Job-Verwaltung (`job_manager.py`) und Integration des Status-Endpunkts `GET /status/{job_id}`.
- **Datenverarbeitung (US-4):** Erste R-Integration via `r_executor.py` zur Verarbeitung von IDAT-Dateien und Sample Sheets mit CSV-Ausgabe der Verarbeitungsergebnisse.
- **Testing:** Einrichtung der Vitest-Testumgebung mit `jsdom` sowie erste Frontend- und Backend-Tests (Upload, Job-System).

### Changed
- Docker-Konfiguration iterativ verbessert.
- API-Kommunikation zwischen Frontend und Backend erweitert.

### Fixed
- Erreichbarkeit des Backends über NGINX-Konfiguration repariert (behob Fehler auf der Upload-Seite).
- Blackscreen-Bug bei fehlerhaftem Upload behoben.
- Ausführung von R-Skripten im Docker-Container korrigiert.