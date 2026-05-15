import AnalysisTable from './src/components/AnalysisTable'
import { analysisMock } from '../tabelle/src/mock/analysisMock'

export default function App() {
  return (
    <>
      <h1>🔬 Analyse Biologique - Résultats d&apos;analyse</h1>
      <p>📊 Affichage de 100 échantillons | Données de test (mock)</p>
      <AnalysisTable columns={analysisMock.columns} rows={analysisMock.rows} />
    </>
  )
}
