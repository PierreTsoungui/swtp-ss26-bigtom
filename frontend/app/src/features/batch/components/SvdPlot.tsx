import React from 'react';
import type { BatchRound } from '../utils/types';

interface SvdPlotProps {
  rounds: BatchRound[];
}

export const SvdPlot: React.FC<SvdPlotProps> = ({ rounds }) => {
  if (rounds.length === 0) return <p>No SVD plots available.</p>;

  const imageHost = 'http://localhost:8000'; // Your backend host

  return (
    <div>
      <h3>SVD Diagnostic Plots</h3>
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {rounds.map((round) => (
          <div 
            key={round.round} 
            style={{ 
              // flex: '0 1 400px' verhindert das unendliche Aufblähen bei wenigen Elementen
              flex: '0 1 400px', 
              border: '1px solid #ddd', 
              padding: '15px', 
              borderRadius: '8px',
              backgroundColor: round.type === 'initial' ? '#f9f9f9' : '#f0fff4'
            }}
          >
            {/* Plot Title */}
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>
              {round.type === 'initial' ? 'Before Correction' : 'After Correction'} (Round {round.round})
            </h4>

            {/* Plot Image */}
            <img
              src={`${imageHost}${round.svd_plot}`}
              alt={`SVD Plot Round ${round.round}`}
              style={{ 
                width: '100%', 
                height: 'auto', 
                display: 'block',
                borderRadius: '4px',
                marginBottom: '10px'
              }}
            />

            {/* Plot Info */}
            <div style={{ fontSize: '0.9em', color: '#666', borderTop: '1px solid #ddd', paddingTop: '10px' }}>
              <div style={{ marginBottom: '8px' }}>
                <strong>Timestamp:</strong> {new Date(round.timestamp).toLocaleString('en-US')}
              </div>
              
              {round.settings_used && (
                <>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Batch Variable:</strong> {round.settings_used.batch_variable}
                  </div>
                  <div>
                    <strong>Covariates:</strong> {round.settings_used.covariates.length > 0 ? round.settings_used.covariates.join(', ') : 'None'}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};