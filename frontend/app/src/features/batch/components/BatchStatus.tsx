import React from 'react';

export const BatchStatus: React.FC = () => {
  return (
    <div style={{ textAlign: 'center', padding: '40px', border: '1px solid #ccf', borderRadius: '8px', backgroundColor: '#eef' }}>
      <h3 style={{ margin: 0, color: '#004085' }}>Batch-Korrektur wird berechnet...</h3>
      <p style={{ margin: '10px 0 20px 0' }}>Bitte hab einen Moment Geduld. Das R-Skript führt ComBat aus und berechnet die neuen SVD-Plots.</p>
      
      {/* Einfache CSS-Progressbar Animation */}
      <div style={{ width: '100%', height: '10px', backgroundColor: '#ddd', borderRadius: '5px', overflow: 'hidden' }}>
        <div style={{
          width: '50%',
          height: '100%',
          backgroundColor: '#0056b3',
          borderRadius: '5px',
          animation: 'moving-progress 1.5s infinite ease-in-out'
        }} />
      </div>

      <style>{`
        @keyframes moving-progress {
          0% { transform: translateX(-100%); width: 30%; }
          50% { width: 60%; }
          100% { transform: translateX(350%); width: 20%; }
        }
      `}</style>
    </div>
  );
};