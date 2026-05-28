# Issue 1 — Sample_Group wird fälschlich als Batch-Faktor genutzt

Stelle im Code: `tech_vars[[*Sample_Group*]] <- as.integer(samples$Sample_Group)`

Erwartung (laut Kundengespräch von 20.05):
Sample_Group repräsentiert biologische Gruppen und darf nicht in Batch-/SVD-Batchanalyse einfließen.

Problem:
Sample_Group wird aktuell als technischer Faktor behandelt. Dadurch fließt biologische Struktur in Batch-Analyse ein.

Konsequenz:
SVD-Plot kann Batch-Effekte falsch interpretieren, biologische Unterschiede werden als technische Effekte dargestellt, falsche Grundlage für ComBat-Entscheidung.

Erwarteter Fix:
Sample_Group aus tech_vars entfernen, explizit als „biologisch ausgeschlossen“ markieren.

# Issue 2 — Keine Whitelist für technische Variablen

Stelle im Code: `for (col in extra_candidates) {`

Erwartung:
Nur definierte technische Variablen dürfen Batch-Faktoren sein (z. B. Sentrix_ID, Position).

Problem:
Alle Spalten werden potenziell als Batch-Faktor verwendet, keine Kontrolle über biologische Variablen.

Konsequenz:
Gefahr von falscher Batch-Korrektur, nicht reproduzierbare Analyse.

Fix:
Whitelist einführen: Sentrix_ID, Sentrix_Position, optional Sample_Well.

# Issue 3 — Abweichung von erwarteter SVD-Referenz

Stelle im Code: `prcomp(t(beta))`

Erwartung:
Laut Pipeline-Design / Standard sollte ChAMP-SVD genutzt werden.

Problem:
Eigene PCA-Implementierung statt ChAMP::SVD, mögliche Abweichung von Referenzmethodik.

Konsequenz:
Ergebnisse nicht direkt vergleichbar mit Standardpipeline, potenziell unterschiedliche Batch-Signale.

Fix:
Prüfen: Migration zu ChAMP::SVD() oder Validierung gegen Referenzoutput.

# Issue 4 — EPICv2 Skalierbarkeit nicht abgesichert

Stelle:
PCA auf kompletter Beta-Matrix

Problem:
Keine explizite Begrenzung / Sampling für große Datensätze.

Konsequenz:
Memory-Overflow Risiko, Performanceprobleme in Produktion.

Fix:
Subsampling oder Feature-Reduction für PCA einbauen.

# Issue 5 — Testvalidierung nur technisch, nicht fachlich

Erwartung:
Tests sollen auch fachliche Korrektheit prüfen.

Problem:
Nur File/Exit-Code/Existenz getestet.

Konsequenz:
Pipeline kann „grün“ sein, aber fachlich falsch.

Fix:
Tests ergänzen für: Sample_Group ausgeschlossen, korrekte Variable-Zuordnung, SVD-Output Plausibilität.