import { useState, type JSX } from "react";
import { validateIdatPairs } from "./utils/idatValidation";
import SubmitButton from "./components/SubmitButton";
import FileViewList from "./components/FileViewList";
import SampleSheetUpload from "./components/SampleSheetUpload";
import IdatUpload from "./components/IdatUpload";
import { useUpload } from "./hooks/useUpload";

// TODOS:
// - Testen mit echten Dateien (auch ungültige Dateien!)
// - Backend-Integration (API-Call mit FormData)
// - (Optional): Drag & Drop Unterstützung für beide Uploads

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

  // Analyse-Button nur aktiv wenn keine Fehler und beide Felder befüllt
  const canSubmit = idatFiles.length > 0 && sampleSheet !== null &&
                    idatErrors.length === 0 && sampleSheetError === "";

  const { data, isLoading, error, upload } = useUpload();
  
  const handleUpload = async () => {
    if (canSubmit) {
      await upload(idatFiles, sampleSheet!);
    }
  }

  // ## IDAT Upload 
  const handleIdatChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const errors: string[] = [];

    const invalidFiles = selected.filter(
      (f) => !f.name.toLowerCase().endsWith(".idat")
    );
    if (invalidFiles.length > 0) {
      errors.push(
        `Ungültige Dateien: ${invalidFiles.map((f) => f.name).join(", ")}`
      );
    }

    const deduplicated = selected.filter(
      (f) => !idatFiles.some((existing) => existing.name === f.name && existing.size === f.size)
    );

    const validFiles = deduplicated.filter((f) =>
      f.name.toLowerCase().endsWith(".idat")
    );

    const allIdatFiles = [...idatFiles, ...validFiles];

    const pairErrors = validateIdatPairs(allIdatFiles);
    setIdatErrors([...errors, ...pairErrors]);
    setIdatFiles(allIdatFiles);

    // Input zurücksetzen damit dieselben Dateien nochmal gewählt werden können
    event.target.value = "";
  };

  // ## Samplesheet Upload 
  const handleSampleSheetChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
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


  const onRemoveIdatFile = (fileName: string) => {
      const updated = idatFiles.filter((f) => f.name !== fileName);
      setIdatErrors(validateIdatPairs(updated));
      setIdatFiles(updated);
  };


  return (
    <div className="container mx-auto">
      <h1 className="text-4xl font-bold text-center m-10">Upload</h1>
      <div className="flex flex-row bg-slate-200 justify-center gap-10 p-10">

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

      {/* Analyse-starten Button */}
      <SubmitButton canSubmit={canSubmit && !isLoading} onClick={handleUpload} />
      {isLoading && <p>Upload läuft...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {data && <p>Job erstellt: {data.job_id}</p>}


      {/* Dateiliste IDAT */}
      <FileViewList files={idatFiles} errors={idatErrors} onRemove={onRemoveIdatFile} />
    </div>
  );
}

export default UploadView;