import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { BrowserRouter } from 'react-router'

/**
 * Das ist die Hauptdatei, die die React-App rendert.
 * Hier wird die App-Komponente in das HTML-Element mit der ID 'root' eingebunden.
 * Alle globalen Provider oder Kontext-Wrapper können hier hinzugefügt werden,
 * um sie in der gesamten App verfügbar zu machen.
 */
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <StrictMode>
      <App />
    </StrictMode>
  </BrowserRouter>
)

