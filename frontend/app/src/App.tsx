import { Route, Routes } from "react-router-dom";
import TabellePage from "./features/tabelle/tabellePage";

import UploadView from "./features/upload/UploadView";
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<p>Home Page</p>} />
      <Route path="/tabelle" element={<TabellePage />} />
            <Route path='/' element={<p>Home Page</p>} />
   

      {/* Richtige Pages hier hinzufügen */}
      <Route path='/upload' element={<UploadView />} />
    </Routes>
  );
}

export default App;
