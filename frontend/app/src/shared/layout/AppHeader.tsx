// app/src/shared/layout/AppHeader.tsx
import React from 'react';
import './AppHeader.css';

interface AppHeaderProps {
  onImpressumClick: () => void;
  onDatenschutzClick: () => void;
  onAboutClick: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onImpressumClick,
  onDatenschutzClick,
  onAboutClick,
}) => {
  return (
    <div className="header-bar">
      <div className="logo-title-group">
        <div className="thm-logo">
          <div className="thm-icon">
            {[...Array(9)].map((_, i) => (
              <span key={i}></span>
            ))}
          </div>
          <div className="thm-text">
            <div className="thm-main">THM</div>
            <div className="thm-sub">TECHNISCHE HOCHSCHULE MITTELHESSEN</div>
          </div>
        </div>
        <div className="title-area">
          <h1>🧬 Methylation Explorer</h1>
          <p>Epigenetic landscape · CpG analysis</p>
        </div>
      </div>
      <div className="legal-buttons">
        <button onClick={onImpressumClick}>📄 Impressum</button>
        <button onClick={onDatenschutzClick}>🔒 Datenschutz</button>
        <button onClick={onAboutClick}>ℹ️ Über uns</button>
      </div>
    </div>
  );
};
