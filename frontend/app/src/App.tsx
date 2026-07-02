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


/**
 * The main application component that manages routing and navigation.
 *
 * Maps URL paths to feature-based views and serves as the container
 * for global layout structures and application-wide context providers.
 */
function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path='/' element={<LandingPage />} />
        <Route path='/upload' element={<UploadView />} />
        <Route path='/analysis/:job_id' element={<AnalysisPage />} />
        <Route path='/normalization/:job_id' element={<NormalizationPage />} />
        <Route path='/datenschutz' element={<DatenschutzPage />} />
        <Route path="/batch/:job_id" element={<BatchPage />} />
        <Route path="/results/:job_id" element={<ResultsPage />} />
      </Routes>
    </AppLayout>
  );
}

export default App;
