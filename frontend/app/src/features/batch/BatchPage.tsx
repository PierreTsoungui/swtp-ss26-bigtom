import React from 'react';
import { useParams } from 'react-router-dom';
import { useBatchCorrection } from './hooks/useBatchCorrection';
import { BatchForm } from './components/BatchForm';
import { SvdPlot } from './components/SvdPlot';
import Progressbar from "../../shared/components/Progressbar.tsx";

const BatchPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();

  const handleAnalysisSuccess = () => {};

  const { history, globalStatus, jobStatus, loading, error, runBatch, skipBatch, isSubmitting } = useBatchCorrection(
    jobId,
    handleAnalysisSuccess
  );

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading batch correction status...</div>;
  }

  // Bestimme, ob ein schwerwiegender Systemfehler vorliegt, der nicht ins Formular gehört
  const isGlobalError = error && (error.error === 'BATCH_FAILED' || error.error === 'NETWORK_ERROR');

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h2>Step 3: Batch Effect Correction</h2>
      <p style={{ color: '#666' }}>Job ID: {jobId}</p>

      {/* Nur kritische Systemfehler (z.B. R-Skript Absturz) werden ganz oben angezeigt */}
      {isGlobalError && (
        <div style={{ padding: '15px', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '4px', marginBottom: '20px' }}>
          <strong>System Error:</strong> {error.message}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', marginTop: '20px' }}>
        
        {/* 1. SVD Plots */}
        <div>
          {history && <SvdPlot rounds={history.rounds} />}
        </div>

        {/* 2. Progressbar: show during backend-run or while normalization is running */}
        {jobStatus && (globalStatus === 'running' || jobStatus.phase === 'normalizing') && (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
            <Progressbar jobStatus={jobStatus} />
          </div>
        )}

        {/* 3. Batch Form (Bekommt jetzt das error-Objekt überreicht) */}
        <div>
          <BatchForm
            onExecuteBatch={runBatch}
            onSkipToAnalysis={skipBatch}
            disabled={globalStatus === 'running' || isSubmitting}
            backendError={error}
          />
        </div>
        
      </div>
    </div>
  );
};

export default BatchPage;