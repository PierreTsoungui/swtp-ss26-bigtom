import './App.css'
import { Route, Routes } from 'react-router';
import MyCounter from './features/myCounterExample/components/MyCounter';
import UploadView from './features/upload/UploadView';


/**
 * Diese Komponente nur nutzen, um die Navigierung der Pages mittels
 * React-Router zu managen und zu den entsprechenden Komponenten zu leiten,
 * die im features-Ordner liegen. Alle globalen Provider oder Kontext-Wrapper können hier hinzugefügt werden,
 * um sie in der gesamten App verfügbar zu machen.
 * @returns 
 */
function App() {
  return (
    <>
    <Routes>
      {/* Hier können die Routen zu den verschiedenen Pages definiert werden */}

      {/* Beispiele: */}
      <Route path='/' element={<p>Home Page</p>} />
      <Route path='/counter-page' element={<MyCounter />} />

      {/* Richtige Pages hier hinzufügen */}
      <Route path='/upload' element={<UploadView />} />
    </Routes>
    </>
  )
}

export default App;
