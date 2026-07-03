import { useState } from "react";
import { Route, Routes } from 'react-router';
import UploadView from './features/upload/UploadView';
import { AnalysisPage } from './features/analysis/AnalysisPage';
import {NormalizationPage} from "./features/normalisation/NormalizationPage.tsx";
import { AppLayout } from './shared/layout/AppLayout';
import { DatenschutzPage } from './shared/pages/DatenschutzPage';
import "./App.css";
import BatchPage from "./features/batch/BatchPage.tsx";
import {ResultsPage} from "./features/tableview/ResultsPage.tsx";
import { LandingPage } from "./features/landing/LandingPage.tsx";
import { FallbackPage } from "./shared/components/FallbackPage.tsx";
import { ErrorBoundary } from "./shared/errors/ErrorBoundary.tsx";


/**
 * Diese Komponente nur nutzen, um die Navigierung der Pages mittels
 * React-Router zu managen und zu den entsprechenden Komponenten zu leiten,
 * die im features-Ordner liegen. Alle globalen Provider oder Kontext-Wrapper können hier hinzugefügt werden,
 * um sie in der gesamten App verfügbar zu machen.
 * @returns 
 */
function App() {
  const [hasFrontendError, setHasFrontendError] = useState(false);

  return (
    <AppLayout hideStepIndicator={hasFrontendError}>
      <ErrorBoundary onErrorStateChange={setHasFrontendError}>
        <Routes>
          <Route path='/' element={<LandingPage />} />
          <Route path='/upload' element={<UploadView />} />
          <Route path='/analysis/:job_id' element={<AnalysisPage />} />
          <Route path='/normalization/:job_id' element={<NormalizationPage />} />
          <Route path='/datenschutz' element={<DatenschutzPage />} />
          <Route path="/batch/:job_id" element={<BatchPage />} />
          <Route path="/results/:job_id" element={<ResultsPage />} />
          <Route path="*" element={<FallbackPage variant="not-found" />} />
        </Routes>
      </ErrorBoundary>
    </AppLayout>
  );
}

export default App;
