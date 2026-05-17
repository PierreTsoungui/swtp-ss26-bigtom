import { Route, Routes } from "react-router-dom";
import TabellePage from "./features/analysis/MethylationAnalysisPage";

import UploadView from "./features/upload/UploadView";
import './App.css'

function App() {
  return (
    <Routes>
      {/* Richtige Pages hier hinzufügen */}
      <Route path='/upload' element={<UploadView />} />
      <Route path="/" element={<p>Home Page</p>} />
      <Route path="/tabelle" element={<TabellePage />} />
 </Routes>
  );
}

export default App;
