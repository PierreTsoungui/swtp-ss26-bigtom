import React, { useState } from 'react';
import type { BatchSettings } from '../utils/types';

interface BatchFormProps {
  onExecuteBatch: (settings: BatchSettings) => void;
  onSkipToAnalysis: () => void;
  disabled: boolean;
}

export const BatchForm: React.FC<BatchFormProps> = ({ onExecuteBatch, onSkipToAnalysis, disabled }) => {
  const [batchVariable, setBatchVariable] = useState('');
  const [covariatesInput, setCovariatesInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!batchVariable.trim()) {
      setLocalError('Bitte gib eine Batch-Variable an.');
      return;
    }

    const covariates = covariatesInput
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (covariates.includes(batchVariable.trim())) {
      setLocalError('Die Batch-Variable darf nicht gleichzeitig als Kovariable genutzt werden.');
      return;
    }

    onExecuteBatch({
      batch_variable: batchVariable.trim(),
      covariates,
    });
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
      <h3>Batch-Parameter</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Batch-Variable (Pflicht):</label>
          <input
            type="text"
            placeholder="z.B. Slide"
            value={batchVariable}
            onChange={(e) => setBatchVariable(e.target.value)}
            disabled={disabled}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Kovariablen (optional, Komma-getrennt):</label>
          <input
            type="text"
            placeholder="z.B. Sample_Group, Age"
            value={covariatesInput}
            onChange={(e) => setCovariatesInput(e.target.value)}
            disabled={disabled}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        {localError && <div style={{ color: 'red', marginBottom: '15px' }}>{localError}</div>}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button
            type="submit"
            disabled={disabled}
            style={{ flex: 1, padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            Korrektur ausführen
          </button>
          <button
            type="button"
            onClick={onSkipToAnalysis}
            disabled={disabled}
            style={{ flex: 1, padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            ANALYSE (Überspringen)
          </button>
        </div>
      </form>
    </div>
  );
};