import React from 'react';
import type { BatchRound } from '../utils/types';

interface SvdPlotProps {
  rounds: BatchRound[];
}

export const SvdPlot: React.FC<SvdPlotProps> = ({ rounds }) => {
  if (rounds.length === 0) return <p>Keine SVD-Plots verfügbar.</p>;

  const initialPlot = rounds.find((r) => r.type === 'initial');
  // Hole das letzte Element für den aktuellen Zustand, aber nur wenn es nicht der initiale Plot selbst ist
  const latestPlot = rounds[rounds.length - 1];
  const hasCorrection = rounds.length > 1;

  const imageHost = 'http://localhost:8000'; // Dein Backend-Host

  return (
    <div>
      <h3>SVD Diagnostik-Plots</h3>
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {/* Initialer Plot (Immer sichtbar) */}
        {initialPlot && (
          <div style={{ flex: '1 1 45%', minWidth: '300px', border: '1px solid #eee', padding: '10px', borderRadius: '4px' }}>
            <h4>Vor Korrektur (Runde 0)</h4>
            <img
              src={`${imageHost}${initialPlot.svd_plot}`}
              alt="SVD Plot Initial"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        )}

        {/* Nachher-Plot (Nur sichtbar nach mindestens einem Batch-Run) */}
        {hasCorrection && latestPlot && (
          <div style={{ flex: '1 1 45%', minWidth: '300px', border: '1px solid #eee', padding: '10px', borderRadius: '4px', backgroundColor: '#f0fff4' }}>
            <h4>Nach Korrektur (Runde {latestPlot.round})</h4>
            <img
              src={`${imageHost}${latestPlot.svd_plot}`}
              alt={`SVD Plot Runde ${latestPlot.round}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
            <div style={{ marginTop: '10px', fontSize: '0.9em', color: '#555' }}>
              <strong>Angewendet:</strong> Variable: {latestPlot.settings_used?.batch_variable} | Kovariablen:{' '}
              {latestPlot.settings_used?.covariates.join(', ') || 'Keine'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};