import { useEffect, useState, type JSX } from "react";
import { useNavigate } from "react-router";

import { useUploadFlow } from "./hooks/useUploadFlow";
import UploadDropzone from "./components/UploadDropzone";
import UploadSpinner from "./components/UploadSpinner";
import FileReviewList from "./components/FileReviewList";
import UploadSampleSheetPreviewModal from "./components/UploadSampleSheetPreviewModal";
import FilterPanel from "./components/FilterPanel.tsx";
import type { SampleSheetCandidate } from "./types";
import HelpButton from "@shared/help/HelpButton.tsx";
import { Button } from "@shared/components/Button.tsx";

/**
 * Main view for data ingestion, implementing the "Inspect → Review → Commit" workflow.
 *
 * Flow logic:
 * 1. **Inspect**: User uploads files/folders; the backend validates and classifies the manifest.
 * 2. **Review**: User identifies the correct sample sheet, assigns required metadata roles,
 *    and configures preprocessing filters.
 * 3. **Commit**: Finalizes the selection and triggers the server-side analysis pipeline.
 */
export function UploadPage(): JSX.Element {
  const navigate = useNavigate();
  const flow = useUploadFlow((jobId) => void navigate(`/analysis/${jobId}`));
  const [preview, setPreview] = useState<SampleSheetCandidate | null>(null);

  useEffect(() => flow.discardOnUnmount, [flow.discardOnUnmount]);

  const busy = flow.status === "inspecting" || flow.status === "committing";

  return (
    <div className="container mx-auto pb-16">
      <div className="m-10 flex items-center justify-center gap-3">
        <h1 className="text-center text-4xl font-bold">Upload</h1>
        <HelpButton topic="upload" ariaLabel="Open upload help" />
      </div>

      {flow.error && (
        <div className="mx-auto mb-4 max-w-3xl rounded-md border border-danger bg-danger-badgeBackground px-4 py-3 text-danger-badgeText">
          {flow.error}
        </div>
      )}

      {/* Idle: the single upload field */}
      {flow.status === "idle" && (
        <div className="mx-auto max-w-3xl">
          <UploadDropzone onFiles={flow.inspect} />
        </div>
      )}

      {/* Inspecting */}
      {flow.status === "inspecting" && <UploadSpinner label="Analyzing your upload…" />}

      {/* Review (also shown while committing, with the spinner below) */}
      {(flow.status === "review" || flow.status === "committing") && flow.manifest && (
        <div className="mx-auto max-w-3xl space-y-6">
          <UploadDropzone onFiles={flow.addFiles} disabled={busy} compact />

          <FileReviewList
            sheets={flow.sheets}
            pairs={flow.visiblePairs}
            otherFiles={flow.manifest.other_files}
            selectedSheetId={flow.selectedSheetId}
            blockingError={flow.blockingError}
            selectionHint={flow.selectionHint}
            mappingColumns={flow.mappingColumns}
            columnMapping={flow.columnMapping}
            onSetRole={flow.setRole}
            onSelectSheet={flow.selectSheet}
            onPreviewSheet={setPreview}
            onRemovePair={flow.removePair}
            disabled={busy}
          />

          <FilterPanel
            filterSettings={flow.filterSettings}
            onFilterSettingsChange={flow.setFilterSettings}
          />

          {flow.status === "committing" && <UploadSpinner label="Starting the analysis…" />}

          <div className="flex justify-center gap-4">
            <Button variant="secondary" size="lg" onClick={flow.reset} disabled={busy}>
              Start over
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => void flow.commit()}
              disabled={!flow.canCommit}
            >
              Start analysis
            </Button>
          </div>
        </div>
      )}

      {preview && flow.manifest && (
        <UploadSampleSheetPreviewModal
          sessionId={flow.manifest.session_id}
          sheetId={preview.id}
          sheetName={preview.name}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
