import React, { useState, useEffect } from 'react';

interface BatchFormProps {
  onExecuteBatch: (settings: any) => void;
  onSkipToAnalysis: () => void;
  disabled: boolean;
  backendError: any; // Der Fehler vom Server
}

export const BatchForm: React.FC<BatchFormProps> = ({ 
  onExecuteBatch, 
  onSkipToAnalysis, 
  disabled, 
  backendError 
}) => {
  const [batchVariable, setBatchVariable] = useState('');
  const [covariatesInput, setCovariatesInput] = useState('');
  
  // Getrennte lokale Fehlerzustände für die Felder
  const [batchError, setBatchError] = useState<string | null>(null);
  const [covariatesError, setCovariatesError] = useState<string | null>(null);
  const [generalFormError, setGeneralFormError] = useState<string | null>(null);

  // ── BACKEND-FEHLER PARSEN UND ZUORDNEN ─────────────────────────────────────
  useEffect(() => {
      setBatchError(null);
      setCovariatesError(null);
      setGeneralFormError(null);

      if (!backendError) return;

      if (Array.isArray(backendError.detail)) {
        backendError.detail.forEach((err: any) => {
          const path = err.loc?.join('.') || '';
          if (path.includes('batch_variable')) {
            setBatchError(`Invalid input: ${err.msg}`);
          } else if (path.includes('covariates')) {
            setCovariatesError(`Invalid input: ${err.msg}`);
          } else {
            setGeneralFormError(err.msg);
          }
        });
        return;
      }

      let errorMsg = 'An error occurred';
      if (typeof backendError.detail === 'string') {
        errorMsg = backendError.detail;
      } else if (backendError.message) {
        errorMsg = backendError.message;
      } else if (typeof backendError.error === 'string') {
        errorMsg = backendError.error;
      }

      const errorType = backendError.error || '';
      const lowerMsg = errorMsg.toLowerCase();

      if (errorType.includes('BATCH') || lowerMsg.includes('batch') || lowerMsg.includes('variable')) {
        setBatchError(errorMsg);
      } else if (lowerMsg.includes('covariable') || lowerMsg.includes('covariate')) {
        setCovariatesError(errorMsg);
      } else {
        setGeneralFormError(errorMsg);
      }
    }, [backendError]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBatchError(null);
    setCovariatesError(null);
    setGeneralFormError(null);

    if (!batchVariable.trim()) {
      setBatchError('Please provide a batch variable.');
      return;
    }

    const covariates = covariatesInput
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (covariates.includes(batchVariable.trim())) {
      setCovariatesError('The batch variable cannot be used as a covariate at the same time.');
      return;
    }

    onExecuteBatch({
      batch_correction: {
        batch_variable: batchVariable.trim(),
        covariates,
      }
    });
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
      <h3>Batch Parameters</h3>
      <form onSubmit={handleSubmit}>
        
        {/* Feld 1: Batch-Variable */}
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="batch-variable" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Batch Variable (Required):
          </label>
          <input
            id="batch-variable" // ◄── HIER FEHLTE DIE ID
            type="text"
            placeholder="e.g., Slide"
            value={batchVariable}
            onChange={(e) => setBatchVariable(e.target.value)}
            disabled={disabled}
            style={{ 
              width: '100%', 
              padding: '8px', 
              borderRadius: '4px', 
              border: batchError ? '1px solid #dc3545' : '1px solid #ccc' 
            }}
          />
          {batchError && (
            <div style={{ color: '#dc3545', fontSize: '14px', marginTop: '5px', fontWeight: '500' }}>
              ⚠️ {batchError}
            </div>
          )}
        </div>

        {/* Feld 2: Kovariablen */}
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="covariates" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Covariates (Optional, comma-separated):
          </label>
          <input
            id="covariates" // ◄── HIER FEHLTE DIE ID
            type="text"
            placeholder="e.g., Sample_Group, Age"
            value={covariatesInput}
            onChange={(e) => setCovariatesInput(e.target.value)}
            disabled={disabled}
            style={{ 
              width: '100%', 
              padding: '8px', 
              borderRadius: '4px', 
              border: covariatesError ? '1px solid #dc3545' : '1px solid #ccc' 
            }}
          />
          {covariatesError && (
            <div style={{ color: '#dc3545', fontSize: '14px', marginTop: '5px', fontWeight: '500' }}>
              ⚠️ {covariatesError}
            </div>
          )}
        </div>

        {/* Allgemeine Fehlermeldungen */}
        {generalFormError && (
          <div style={{ color: '#dc3545', marginBottom: '15px', fontSize: '14px', fontWeight: '500' }}>
            ⚠️ {generalFormError}
          </div>
        )}
        
        {backendError?.detail?.available && (
          <div style={{ padding: '10px', backgroundColor: '#fff3cd', color: '#856404', borderRadius: '4px', marginBottom: '15px', fontSize: '13px' }}>
            <strong>Available columns in SampleSheet:</strong> {backendError.detail.available.join(', ')}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button
            type="submit"
            disabled={disabled}
            style={{ 
              flex: 1, padding: '10px', backgroundColor: '#28a745', color: 'white', 
              border: 'none', borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 'bold' 
            }}
          >
            Batch
          </button>
          <button
            type="button"
            onClick={onSkipToAnalysis}
            disabled={disabled}
            style={{ 
              flex: 1, padding: '10px', backgroundColor: '#1e7e34', color: 'white', 
              border: 'none', borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 'bold' 
            }}
          >
            Skip
          </button>
        </div>
      </form>
    </div>
  );
};