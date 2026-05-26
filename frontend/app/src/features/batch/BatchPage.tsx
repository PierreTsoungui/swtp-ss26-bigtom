import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBatchCorrection } from './hooks/useBatchCorrection';
import { BatchForm } from './components/BatchForm';
import { SvdPlot } from './components/SvdPlot';
import { BatchStatus } from './components/BatchStatus';

const BatchPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  // Callback bei erfolgreichem Skip -> Weiterleitung zur Analyse-Seite
  const handleSkipSuccess = () => {
    navigate(`/analysis/${jobId}`);
  };

  const { history, globalStatus, loading, error, runBatch, skipBatch } = useBatchCorrection(
    jobId,
    handleSkipSuccess
  );

  if (loading) {
    return <div style={{ padding: '20px' }}>Lade Batch-Korrektur-Status...</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h2>Schritt 3: Batch-Effekt-Korrektur</h2>
      <p style={{ color: '#666' }}>Job-ID: {jobId}</p>

      {/* Backend-Fehlermeldungen strukturiert anzeigen */}
      {error && (
        <div style={{ padding: '15px', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '4px', marginBottom: '20px' }}>
          <strong>Fehler [{error.error}]:</strong> {error.message}
          {error.detail?.available && (
            <div style={{ marginTop: '5px', fontSize: '0.9em' }}>
              Verfügbare Spalten im Samplesheet: <em>{error.detail.available.join(', ')}</em>
            </div>
          )}
        </div>
      )}

      {/* Wenn Korrektur läuft, zeige den Loader anstelle des Formulars */}
      {globalStatus === 'running' ? (
        <BatchStatus />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px', marginTop: '20px' }}>
          {/* Linke Spalte: Steuer-Formular */}
          <div>
            <BatchForm
              onExecuteBatch={runBatch}
              onSkipToAnalysis={skipBatch}
              disabled={globalStatus === 'running'}
            />
          </div>

          {/* Rechte Spalte: Die Plots */}
          <div>
            {history && <SvdPlot rounds={history.rounds} />}
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchPage;