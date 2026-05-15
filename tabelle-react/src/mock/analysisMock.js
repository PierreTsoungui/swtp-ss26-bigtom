/**
 * analysisMock.js
 *
 * Diese Datei enthält Testdaten (Mock-Daten) für die Analysetabelle.
 * Sie simuliert 100 biologische Probeneinträge mit zufälligen Konzentrationswerten.
 * Die Daten werden in der AnalysisTable-Komponente verwendet.
 */

export const analysisMock = {
  // Spaltennamen der Tabelle
  columns: [
    "Proben-ID",
    "Konzentration (µg/L)",
    "Einheit",
    "Entnahmedatum",
    "Analyse-Status"
  ],
  // 100 Zeilen werden automatisch generiert
  rows: Array.from({ length: 100 }, (_, i) => [
    `PROBE-${String(i + 1).padStart(3, "0")}`, // Eindeutige Proben-ID (z.B. PROBE-001)
    (Math.random() * 100).toFixed(2),           // Zufälliger Konzentrationswert (0–100)
    "µg/L",                                     // Maßeinheit
    `2025-05-${String((i % 28) + 1).padStart(2, "0")}`, // Entnahmedatum im Mai 2025
    ["Abgeschlossen", "Validiert", "In Bearbeitung"][i % 3] // Status rotiert alle 3 Zeilen
  ])
}
