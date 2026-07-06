import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { MethodPreview, NormalizationMethod } from "./types";
import { useNormalizationPreview } from "./hooks/useNormalizationPreview";
import { useNormalizationSubmit } from "./hooks/useNormalizationSubmit";
import { orderMethods } from "./utils/orderMethods";
import { shouldNavigateToBatch } from "./utils/normalizationState";
import { useJobPolling } from "../../shared/hooks/useJobPolling.ts";
import Progressbar from "../../shared/components/Progressbar.tsx";
import PcaViewer from "./components/PcaViewer.tsx";
import LoadingScreen from "./components/LoadingScreen.tsx";
import MethodCard from "./components/MethodCard.tsx";
import type { JobStatus } from "../../shared/types/JobTypes.ts";
import HelpButton from "../../shared/help/HelpButton.tsx";
import { Button } from "../../shared/components/Button";
import ErrorMessage from "../../shared/errors/ErrorMessage.tsx";

/**
 * Page for selecting and initiating the data normalization method.
 *
 * Responsibilities:
 * - Displays comparative visualizations (Density and PCA plots) for each method.
 * - Manages method selection and triggers the server-side normalization process.
 * - Synchronizes with {@link useJobPolling} to monitor progress until the
 *   batch correction phase is reached.
 *
 * @remarks
 * Methods are displayed in a fixed order (defined in {@link METHOD_ORDER}),
 * ensuring the 'RAW' unnormalized data is always shown as the baseline on the left.
 */
export function NormalizationPage() {
  const { job_id } = useParams<{ job_id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error, setError } = useNormalizationPreview(job_id ?? null);
  const { submitMethod, isSubmitting } = useNormalizationSubmit(job_id ?? null, setError);
  const [selected, setSelected] = useState<NormalizationMethod | null>(null);
  const [pcaMethod, setPcaMethod] = useState<MethodPreview | null>(null);
  const [isNormalising, setIsNormalising] = useState(false);

  // 'raw' first, then the algorithms in canonical order (see METHOD_ORDER).
  const orderedMethods = useMemo(() => orderMethods(data?.methods ?? []), [data]);

  const jobStatus: JobStatus | null = useJobPolling(isNormalising ? (job_id ?? null) : null);

  // Once the pipeline parks at batch/waiting, hand off to the batch page.
  useEffect(() => {
    if (shouldNavigateToBatch(jobStatus)) {
      void navigate(`/batch/${job_id}`);
    }
  }, [jobStatus, job_id, navigate]);

  /**
   * Submits the selected method and, on success, switches the UI into the
   * polling/progress state so the job's progress can be tracked.
   */
  const handleConfirm = async () => {
    if (!selected) return;
    const accepted = await submitMethod(selected);
    if (accepted) {
      setIsNormalising(true);
    }
  };

  if (isLoading) {
    return <LoadingScreen message="Loading normalization previews..." />;
  }
  if (!data && !error) return null;

  const isDisabled: boolean = !selected || isSubmitting || isNormalising;

  return (
    <main className="min-h-screen bg-neutral-background px-6 py-10">
      <ErrorMessage
        open={Boolean(error)}
        error={error}
        vertical="top"
        horizontal="center"
        onClose={() => setError(null)}
      />

      {/* Interactive PCA-Viewer */}
      {pcaMethod && pcaMethod.pca && (
        <PcaViewer
          method={pcaMethod.method}
          data={pcaMethod.pca}
          onClose={() => setPcaMethod(null)}
        />
      )}

      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl font-semibold text-neutral-textPrimary">
          Choose a normalization method
        </h1>
        <HelpButton topic="normalization" ariaLabel="Open Help with normalization" />
      </div>
      <p className="mb-8 text-neutral-textSecondary">Click a plot for an enlarged view.</p>

      {/* METHOD CARDS (RAW left, then other methods) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-10">
        {orderedMethods.map((method) => (
          <MethodCard
            key={method.method}
            method={method}
            isSelected={selected === method.method}
            onSelect={setSelected}
            onPcaClick={setPcaMethod}
          />
        ))}
      </div>

      {/* Progressbar active during live server processing execution */}
      {isNormalising && jobStatus && (
        <div className="mb-5" data-testid="normalization-progressbar-container">
          <Progressbar jobStatus={jobStatus} showNextButton={false} />
        </div>
      )}

      {/* Operational submit action triggers */}
      <div className="flex justify-center">
        <Button
          variant="primary"
          size="lg"
          onClick={() => void handleConfirm()}
          disabled={isDisabled}
        >
          {isSubmitting ? "Starting..." : `Confirm method`}
        </Button>
      </div>
    </main>
  );
}
