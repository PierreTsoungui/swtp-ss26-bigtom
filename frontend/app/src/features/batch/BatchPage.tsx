import React from 'react';
import { useParams } from 'react-router-dom'; // navigate entfernt
import { useBatchCorrection } from './hooks/useBatchCorrection';
import { BatchForm } from './components/BatchForm';
import { SvdPlot } from './components/SvdPlot';
import Progressbar from './components/Progressbar';

const BatchPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();

  const handleAnalysisSuccess = () => {
    // Isoliertes Testen ohne Navigation
  };

  const { history, globalStatus, jobStatus, loading, error, runBatch, skipBatch } = useBatchCorrection(
    jobId,
    handleAnalysisSuccess
  );

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading batch correction status...</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h2>Step 3: Batch Effect Correction</h2>
      <p style={{ color: '#666' }}>Job ID: {jobId}</p>

      {/* Backend Error Display */}
      {error && (
        <div style={{ padding: '15px', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '4px', marginBottom: '20px' }}>
          <strong>Error [{error.error}]:</strong> {error.message}
          {error.detail?.available && (
            <div style={{ marginTop: '5px', fontSize: '0.9em' }}>
              Available columns in samplesheet: <em>{error.detail.available.join(', ')}</em>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', marginTop: '20px' }}>
        
        {/* 1. SVD Plots */}
        <div>
          {history && <SvdPlot rounds={history.rounds} />}
        </div>

        {/* 2. Progressbar (Fehler mit 'my: 2' behoben) */}
        {globalStatus === 'running' && jobStatus && (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
            <Progressbar jobStatus={jobStatus} />
          </div>
        )}

        {/* 3. Batch Form */}
        <div>
          <BatchForm
            onExecuteBatch={runBatch}
            onSkipToAnalysis={skipBatch}
            disabled={globalStatus === 'running'}
          />
        </div>
        
      </div>
    </div>
  );
};

export default BatchPage;