import { useState, type JSX } from "react";
import Chip from "@mui/material/Chip";
import CheckIcon from '@mui/icons-material/Check';
import WarningIcon from '@mui/icons-material/Warning';

// TODOS:
// - Testen mit echten Dateien (auch ungültige Dateien!)
// - Backend-Integration (API-Call mit FormData)
// - Optional: Drag & Drop Unterstützung für beide Uploads

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

  // ── Paar-Validierung ──────────────────────────────────────────
  const validateIdatPairs = (files: File[]): string[] => {
    const errors: string[] = [];
    const grn = files.filter((f) => f.name.includes("_Grn.idat"));
    const red = files.filter((f) => f.name.includes("_Red.idat"));

    grn.forEach((grnFile) => {
      const prefix = grnFile.name.replace("_Grn.idat", "");
      const hasPartner = red.some((r) => r.name === `${prefix}_Red.idat`);
      if (!hasPartner)
        errors.push(`Kein Red-Partner für: ${grnFile.name}`);
    });

    red.forEach((redFile) => {
      const prefix = redFile.name.replace("_Red.idat", "");
      const hasPartner = grn.some((g) => g.name === `${prefix}_Grn.idat`);
      if (!hasPartner)
        errors.push(`Kein Grn-Partner für: ${redFile.name}`);
    });


    if (files.length % 2 !== 0 && files.length > 0) {
      errors.push("Ungerade Anzahl an IDAT-Dateien, es sollten Paare von Grn/Red vorliegen.");
    }

    return errors;
  };

  // ── IDAT Upload ───────────────────────────────────────────────
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

  // ── Samplesheet Upload ────────────────────────────────────────
  const handleSampleSheetChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const type = file.type; 
    // Grobe Filendingprüfung: Backend sollte Inhalt prüfe
    const validExtensions = [".csv", ".xlsx"];
    const hasValidExtension = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );

    const isXlsx = type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const isCsv = file.name.toLowerCase().endsWith(".csv") && type === "text/csv";

    if (!hasValidExtension || (!isXlsx && !isCsv)) {
      setSampleSheetError(
        "Ungültiger Dateityp. Nur .csv oder .xlsx erlaubt."
      );
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

  // Analyse-Button nur aktiv wenn keine Fehler und beide Felder befüllt
  const canSubmit =
    idatFiles.length > 0 &&
    sampleSheet !== null &&
    idatErrors.length === 0 &&
    sampleSheetError === "";

  return (
    <div className="container mx-auto">
      <h1 className="text-4xl font-bold text-center m-10">Upload</h1>

      <div className="flex flex-row bg-slate-200 justify-center gap-10 p-10">

        {/* IDAT Upload */}
        <div className="flex flex-col gap-2">
          <label className="cursor-pointer bg-slate-400 hover:bg-slate-500
                            rounded-full p-4 px-8 text-center">
            IDAT-Dateien auswählen
            <input
              type="file"
              className="hidden"
              multiple
              accept=".idat"
              onChange={handleIdatChange}
            />
          </label>
          <p className="text-sm"><b>Erlaubte Dateien:</b> *.idat</p>
          <p className="text-sm text-slate-500">
            {idatFiles.length > 0 &&
              `${idatFiles.length} Dateien (${idatFiles.length / 2} Paare)`}
          </p>
          {idatErrors.map((err, i) => (
            <p key={i} className="text-sm text-red-600"><WarningIcon fontSize="small" /> {err}</p>
          ))}
        </div>

        {/* Samplesheet Upload */}
        <div className="flex flex-col gap-2">
          <label className="cursor-pointer bg-slate-400 hover:bg-slate-500
                            rounded-full p-4 px-8 text-center">
            Sample Sheet auswählen
            <input
              type="file"
              className="hidden"
              accept=".csv,.xlsx"
              onChange={handleSampleSheetChange}
            />
          </label>
          <p className="text-sm"><b>Erlaubte Dateien:</b> *.csv, *.xlsx</p>
          {sampleSheet && (
            <p className="text-sm text-green-600"><CheckIcon fontSize="small" /> {sampleSheet.name}</p>
          )}
          {sampleSheetError && (
            <p className="text-sm text-red-600"><WarningIcon fontSize="small" /> {sampleSheetError}</p>
          )}
        </div>
      </div>


        {/* Submit */}
        <div className="flex justify-center m-10">
            <button
            disabled={!canSubmit}
            onClick={() => console.log("Not implemented yet!")}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300
                        disabled:cursor-not-allowed text-white font-bold
                        py-3 px-10 rounded-full transition-colors"
            >
            Analyse starten
            </button>
        </div>

      {/* Dateiliste IDAT */}
      <div className="m-10">
        <h2 className="text-2xl font-bold m-5">
          IDAT-Dateien ({idatFiles.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          {idatFiles.map((file, index) => (
            <Chip
              key={index}
              label={file.name}
              onDelete={() => onRemoveIdatFile(file.name)}
              color={idatErrors.length > 0 ? "error" : "primary"}
              variant="outlined"
              size="small"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default UploadView;