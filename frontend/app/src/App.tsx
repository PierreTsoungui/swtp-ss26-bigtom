import { Route, Routes } from 'react-router';
import UploadView from './features/upload/UploadView';
import { AnalysisPage } from './features/analysis/AnalysisPage';
import {NormalizationPage} from "./features/normalisation/NormalizationPage.tsx";
import { AppLayout } from './shared/layout/AppLayout';
import { DatenschutzPage } from './pages/DatenschutzPage';
import "./App.css";


/**
 * Diese Komponente nur nutzen, um die Navigierung der Pages mittels
 * React-Router zu managen und zu den entsprechenden Komponenten zu leiten,
 * die im features-Ordner liegen. Alle globalen Provider oder Kontext-Wrapper können hier hinzugefügt werden,
 * um sie in der gesamten App verfügbar zu machen.
 * @returns 
 */
function App() {
  return (
    <AppLayout>
      <Routes>
      {/* Hier können die Routen zu den verschiedenen Pages definiert werden */}
      <Route path='/' element={<p>Home Page</p>} />
      <Route path='/upload' element={<UploadView />} />
      <Route path='/analysis/:job_id' element={<AnalysisPage />} />
        <Route path='/normalization/:job_id' element={<NormalizationPage />} />
        <Route path='/datenschutz' element={<DatenschutzPage />} />
      </Routes>
    </AppLayout>
  )
}

export default App;
