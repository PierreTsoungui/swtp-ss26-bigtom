import { useState } from "react";
import { Route, Routes } from "react-router";
import "./App.css";

// Feature pages are imported exclusively through each feature's public API
// (its index.ts), never from internal files (see frontend-architecture.md §5).
// Cross-boundary imports use the @features / @shared path aliases (§12).
import { LandingPage, LANDING_SECTIONS } from "@features/landing";
import { UploadPage } from "@features/upload";
import { AnalysisPage } from "@features/analysis";
import { NormalizationPage } from "@features/normalization";
import { BatchPage } from "@features/batch";
import { ResultsPage } from "@features/results";

import { AppLayout } from "@shared/layout/AppLayout";
import { PrivacyPolicyPage } from "@shared/pages/PrivacyPolicyPage";
import { FallbackPage } from "@shared/components/FallbackPage";
import { ErrorBoundary } from "@shared/errors/ErrorBoundary";

/**
 * The main application component that manages routing and navigation.
 *
 * Maps URL paths to feature-based views and serves as the container
 * for global layout structures and application-wide context providers.
 */
function App() {
  const [hasFrontendError, setHasFrontendError] = useState(false);

  return (
    <AppLayout hideStepIndicator={hasFrontendError} landingSections={LANDING_SECTIONS}>
      <ErrorBoundary onErrorStateChange={setHasFrontendError}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/analysis/:job_id" element={<AnalysisPage />} />
          <Route path="/normalization/:job_id" element={<NormalizationPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/batch/:job_id" element={<BatchPage />} />
          <Route path="/results/:job_id" element={<ResultsPage />} />
          <Route path="*" element={<FallbackPage variant="not-found" />} />
        </Routes>
      </ErrorBoundary>
    </AppLayout>
  );
}

export default App;
