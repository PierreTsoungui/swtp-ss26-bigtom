/**
 * App.jsx
 *
 * Dies ist die Hauptkomponente der Anwendung.
 * Sie lädt die Mock-Daten und übergibt sie an die AnalysisTable-Komponente
 * zur Darstellung der biologischen Analyseergebnisse.
 */

import AnalysisTable from "./AnalysisTable"
import { analysisMock } from './mock/analysisMock'

export default function App() {
  return (
    <div style={{ padding: '20px' }}>
      {/* Seitentitel */}
      <h1>🔬 Analyseergebnisse</h1>

      {/* Kurze Beschreibung der angezeigten Daten */}
      <p>📊 Anzeige von 100 Proben | Testdaten (mock)</p>

      {/* Tabelle wird mit Spalten und Zeilen aus den Mock-Daten befüllt */}
      <AnalysisTable columns={analysisMock.columns} rows={analysisMock.rows} />
    </div>
  )
}
