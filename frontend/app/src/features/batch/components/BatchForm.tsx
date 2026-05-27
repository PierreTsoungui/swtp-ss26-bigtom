import React, { useState } from 'react';

interface BatchFormProps {
  // Wir passen den Typ hier flexibel an, damit das Nesting für das Backend stimmt
  onExecuteBatch: (settings: any) => void;
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
      setLocalError('Please provide a batch variable.');
      return;
    }

    const covariates = covariatesInput
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (covariates.includes(batchVariable.trim())) {
      setLocalError('The batch variable cannot be used as a covariate at the same time.');
      return;
    }

    // ── HIER WAR DER FEHLER: Das Backend braucht das Nesting in "batch_correction" ──
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
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Batch Variable (Required):</label>
          <input
            type="text"
            placeholder="e.g., Slide"
            value={batchVariable}
            onChange={(e) => setBatchVariable(e.target.value)}
            disabled={disabled}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Covariates (Optional, comma-separated):</label>
          <input
            type="text"
            placeholder="e.g., Sample_Group, Age"
            value={covariatesInput}
            onChange={(e) => setCovariatesInput(e.target.value)}
            disabled={disabled}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        {localError && <div style={{ color: 'red', marginBottom: '15px' }}>{localError}</div>}

        {/* Buttons: Beide grün, auf Englisch ("Batch" & "Skip") */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button
            type="submit"
            disabled={disabled}
            style={{ 
              flex: 1, 
              padding: '10px', 
              backgroundColor: '#28a745', // Schönes Grün
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            Batch
          </button>
          <button
            type="button"
            onClick={onSkipToAnalysis}
            disabled={disabled}
            style={{ 
              flex: 1, 
              padding: '10px', 
              backgroundColor: '#1e7e34', // Etwas dunkleres Grün zur optischen Trennung
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            Skip
          </button>
        </div>
      </form>
    </div>
  );
};