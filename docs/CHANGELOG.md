Changelog
Alle wesentlichen Änderungen dieses Projekts werden in dieser Datei dokumentiert.
Das Format basiert auf Keep a Changelog.

[Unreleased]
(Noch keine Änderungen seit v0.2.0)

[v1.0.0] - Geplant
Added
DMP/DMR-Analyse

DMP-Analyse (Differentially Methylated Positions)
DMR-Analyse (Differentially Methylated Regions)

Batch-Korrektur

Vollständiger Workflow für Batch-Korrekturen
Dynamische Auswahl von Batch-Variablen
SVD-Visualisierung vor und nach Batch-Korrektur
Protokollierung mehrerer Batch-Korrekturrunden

Ergebnistabellen

Mehrere Tabellenansichten
Serverseitige Pagination, Sortierung und Filterung
Erweiterte Tabellennavigation

Benutzeroberfläche

Verbessertes globales Layout und Navigation
Erweiterte Statusanzeigen und Benutzerführung

Export

CSV/TSV-Export von Analyseergebnissen
PNG-Export für generierte Diagramme


[v0.2.0] - 2026-04
Added
Initiale Filterung (US-9)

Implementierung der initialen Datenfilterung im R-Backend
Speicherung und Abruf von Filterstatistiken

Filterstatistik (US-12)

Backend-Endpunkte für Filterstatistiken
Frontend-Darstellung der Filterergebnisse

Progress Bar (US-11)

Fortschrittsanzeige für laufende Analyseprozesse
Status-Polling zwischen Frontend und Backend

Normalization Preview (US-13, US-14, US-15)

Vorschau verschiedener Normalisierungsmethoden (BMIQ, FUNNORM, QUANTILE u.a.)
Darstellung von Density-Plots und PCA-Plots
Neue Frontend-Seite für den Methodenvergleich
Auswahl der gewünschten Normalisierungsmethode

Normalisierung (US-16, US-17)

API-Endpunkt zur Auswahl und Bestätigung der Normalisierung
Integration von R-Skripten zur Datennormalisierung
Automatische Verarbeitung der gewählten Methode

Ergebnistabelle (US-18)

Dynamische Ergebnistabelle mit Sortierung und Ladezuständen
Integration in die Benutzeroberfläche

Table Handler (US-19)

Serverseitige Pagination für große Datensätze
Neue API-Route /table

Analyseabbruch (US-23)

Neuer Endpunkt POST /api/v1/reset/{job_id}
Laufende Analysen können vom Frontend aus abgebrochen werden

Changed

Fehlerformat an API-Vertrag angepasst (einheitliche Fehlerstruktur)
Verbesserte File-Validierung mit API-konformer Fehlerrückgabe
Überarbeitung der Normalisierungs-Pipeline im R-Backend
Verbesserte Statusverwaltung von Analysejobs
Bereinigung der .gitignore-Struktur (zentralisiert im Root-Verzeichnis)

Fixed

Korrekte Generierung aller Normalisierungs-Plots (FUNNORM, QUANTILE)
Fehler bei PNG-Erzeugung unter Docker behoben (pthread_create-Fehler)
Fehlerhafte API-URLs im Frontend korrigiert
Anzeige von Filterstatistiken repariert
Stabilere Kommunikation zwischen Frontend und R-Backend


[v0.1.0] - 2026-03
Added
Projektgrundlage

Initiale Projektstruktur eingerichtet
React-Frontend mit React Router initialisiert
FastAPI-Backend aufgesetzt
Docker-Umgebung mit NGINX-Konfiguration eingerichtet

Datei-Upload (US-2)

Upload von IDAT-Dateien und Sample Sheets
Datei-Validierung mit Magic Numbers
Upload-Komponente im Frontend
Custom Hook für API-Aufrufe
Vitest-Tests für die Upload-Komponente

Job-System

Job-Datenmodell (job.py) eingeführt
Job-Verwaltung (job_manager.py) implementiert
Status-Endpunkt GET /status/{job_id} integriert

Datenverarbeitung (US-4)

Erste R-Integration via r_executor.py
Verarbeitung von IDAT-Dateien und Sample Sheets
CSV-Ausgabe der Verarbeitungsergebnisse

Testing

Vitest-Testumgebung mit jsdom eingerichtet
Erste Frontend-Tests (Upload-Komponente)
Erste Backend-Tests (Upload, Job-System)

Changed

Docker-Konfiguration iterativ verbessert
API-Kommunikation zwischen Frontend und Backend erweitert

Fixed

Upload-Seite konnte Backend nicht erreichen (NGINX-Konfiguration)
Blackscreen-Bug bei fehlerhaftem Upload behoben
Ausführung von R-Skripten im Docker-Container korrigiert