import { useState, type JSX } from "react";
import { validateIdatPairs } from "./utils/idatValidation";
import SubmitButton from "./components/SubmitButton";
import FileViewList from "./components/FileViewList";
import SampleSheetUpload from "./components/SampleSheetUpload";
import IdatUpload from "./components/IdatUpload";
import { useUpload } from "./hooks/useUpload";
import { useNavigate } from "react-router";
import { getFileIdentity } from "./utils/fileIdentity";
import FilterPanel from "./components/FilterPanel.tsx";
import {DEFAULT_FILTER_SETTINGS, type FilterSettings} from "./utils/types.ts";
import HelpButton from "../analysis/components/HelpButton.tsx";
import { helpTexts } from "../../shared/utils/help/helpTexts.ts";

/**
 * Komponente für den Upload von IDAT-Dateien und einem Sample Sheet.
 * Validiert die Dateien direkt im Frontend und zeigt Fehler an.
 * Der Analyse-Button wird nur aktiv, wenn alle Validierungen bestanden sind.
 * @note Die Validierung prüft aktuell nur die Dateinamen und -typen, nicht den Inhalt der Dateien.
 * @returns JSX.Element 
 */
function UploadView() : JSX.Element {

  const [idatFiles, setIdatFiles] = useState<File[]>([]);
  const [sampleSheet, setSampleSheet] = useState<File | null>(null);
  const [idatErrors, setIdatErrors] = useState<string[]>([]);
  const [sampleSheetError, setSampleSheetError] = useState<string>("");

  const [filterSettings, setFilterSettings] = useState<FilterSettings>(DEFAULT_FILTER_SETTINGS);

  const navigate = useNavigate();

  // Analyse-Button nur aktiv wenn keine Fehler und beide Felder befüllt
  const canSubmit = idatFiles.length > 0 && sampleSheet !== null &&
                    idatErrors.length === 0 && sampleSheetError === "";

  const { isLoading, error, upload } = useUpload();
  
  const handleUpload = async () => {
    if (!canSubmit || !sampleSheet) return;

    const jobId = await upload(idatFiles, sampleSheet, filterSettings);

    if (jobId) {
      void navigate(`/analysis/${jobId}`);
    }
  }

  // ## IDAT Upload 
  const handleIdatChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedIdatFiles = Array.from(event.target.files ?? []).filter((f) =>
      f.name.toLowerCase().endsWith(".idat")
    );

    const existingFileIds = new Set(idatFiles.map(getFileIdentity));
    const deduplicated = selectedIdatFiles.filter(
      (f) => !existingFileIds.has(getFileIdentity(f))
    );

    const allIdatFiles = [...idatFiles, ...deduplicated];

    setIdatErrors(validateIdatPairs(allIdatFiles));
    setIdatFiles(allIdatFiles);

    event.target.value = "";
  };

  // ## Samplesheet Upload 
  const handleSampleSheetChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Grobe Dateiendprüfung: Server sollte Inhalt selbst prüfen, ob dieser dem Dateityp entspricht
    const type = file.type; 
    const validExtensions = [".csv", ".xlsx"];
    const hasValidExtension = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );

    const isXlsx = type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const isCsv = file.name.toLowerCase().endsWith(".csv") && type === "text/csv";

    if (!hasValidExtension || (!isXlsx && !isCsv)) {
      setSampleSheetError("Ungültiger Dateityp. Nur .csv oder .xlsx erlaubt.");
      setSampleSheet(null);
      return;
    }

    setSampleSheetError("");
    setSampleSheet(file);
    event.target.value = "";
  };


  const onRemoveIdatFile = (fileToRemove: File) => {
      const fileIdToRemove = getFileIdentity(fileToRemove);
      const updated = idatFiles.filter((f) => getFileIdentity(f) !== fileIdToRemove);
      setIdatErrors(validateIdatPairs(updated));
      setIdatFiles(updated);
  };


  return (
    <div className="container mx-auto">
      <div className="m-10 flex items-center justify-center gap-3">
        <h1 className="text-4xl font-bold text-center">Upload</h1>
        <HelpButton
          helpText={helpTexts.upload}
          ariaLabel="Hilfe zum Upload öffnen"
          dialogTitle="Upload Raw Data & Sample Information"
        />
      </div>
      <div className="flex flex-row bg-neutral-surface justify-center gap-10 p-10">

        {/* IDAT Upload */}
        <IdatUpload 
          idatFiles={idatFiles}
          idatErrors={idatErrors}
          handleIdatChange={handleIdatChange}
        />

        {/* Samplesheet Upload */}
        <SampleSheetUpload 
          sampleSheet={sampleSheet}
          sampleSheetError={sampleSheetError}
          onSampleSheetChange={handleSampleSheetChange}
        />
      </div>

      {/* Filtereinstellungen */}
      <FilterPanel filterSettings={filterSettings} onFilterSettingsChange={setFilterSettings} />

      {/* Analyse-starten Button */}
      <SubmitButton
        canSubmit={canSubmit && !isLoading}
        onClick={() => {
          void handleUpload();
        }}
      />
      {isLoading && <p>Upload läuft...</p>}
      {error && <p className="text-danger">{error}</p>}

      {/* Dateiliste IDAT */}
      <FileViewList files={idatFiles} errors={idatErrors} onRemove={onRemoveIdatFile} />
    </div>
  );
}

export default UploadView;
