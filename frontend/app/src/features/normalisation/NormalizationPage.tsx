import {useEffect, useMemo, useState} from "react";
import { useParams, useNavigate } from "react-router";
import type { MethodPreview, NormalizationMethod } from "./utils/types";
import { METHOD_ORDER } from "./utils/types";
import { useNormalizationPreview } from "./hooks/useNormalizationPreview";
import {useJobPolling} from "../analysis/hooks/useJobPolling.ts";
import Progressbar from "../../shared/components/Progressbar.tsx";
import PcaViewer from "./components/PcaViewer.tsx";
import LoadingScreen from "./components/LoadingScreen.tsx";
import MethodCard from "./components/MethodCard.tsx";
import {JobPhase, type JobStatus, JobStatusValue} from "../../shared/utils/JobTypes.ts";
import HelpButton from "../../shared/help/HelpButton.tsx";
import ErrorMessage from "../../shared/error-handling/components/ErrorMessage.tsx";


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
  const [selected, setSelected] = useState<NormalizationMethod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pcaMethod, setPcaMethod] = useState<MethodPreview | null>(null);
  const [isNormalising, setIsNormalising] = useState(false);

  /**
   * Computes a sorted list of methods.
   * Ensures 'RAW' is first, followed by algorithms in their canonical order.
  */
  const orderedMethods = useMemo(() => {
    const methods = data?.methods ?? [];
    return [...methods].sort(
      (a, b) =>
        (METHOD_ORDER.indexOf(a.method) + 1 || 99) -
        (METHOD_ORDER.indexOf(b.method) + 1 || 99),
    );
  }, [data]);

  const jobStatus : JobStatus | null  = useJobPolling(isNormalising ? (job_id ?? null) : null);

  useEffect(() => {
      if (!jobStatus) return;
      if (jobStatus.status === JobStatusValue.WAITING && jobStatus.phase === JobPhase.BATCH) {
        navigate(`/batch/${job_id}`);
      }
  }, [jobStatus?.status, job_id, navigate]);

  /**
   * Submits the selected method to the backend.
   * Transitions the UI into a polling/progress state upon success.
   */
  const handleConfirm = async () => {
    if (!selected || !job_id) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/v1/normalize/${job_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: selected }),
      });

        if (!res.ok) {
            const errorData = await res.json().catch(() => null);
            setError(
                errorData ?? {
                    title: "Request failed",
                    detail: `HTTP ${res.status}`,
                    status: res.status,
                }
            );
            return;
        }
      setIsNormalising(true);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "An unknown error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) { return <LoadingScreen message="Loading normalization previews..." /> }
  if (!data && !error) return null;

  const isDisabled : boolean = !selected || isSubmitting || isNormalising;

  return (

    <main className="min-h-screen bg-neutral-background px-6 py-10">
        <ErrorMessage
            open={Boolean(error)}
            error={error}
            vertical="top"
            horizontal="center"
            onClose={() => setError(null)}
        />

      {/* Interaktiver PCA-Viewer (Farben, Labels, PNG-Export) */}
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
      <p className="mb-8 text-neutral-textSecondary">
          Click a plot for an enlarged view.
      </p>

      {/* METHOD CARDS (RAW links, dann Normalisierungsmethoden) */}
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

      {/* Ladebalken */}
      {isNormalising && jobStatus && (
          <div className="mb-5">
            <Progressbar jobStatus={jobStatus} showNextButton={false} onNext={() => {}} />
          </div>
      )}

      {/* CONFIRM BUTTON */}
      <div className="flex justify-center">
        <button
          onClick={handleConfirm}
          disabled={isDisabled}
          className={`
            rounded-full px-10 py-3 font-bold text-primary-text
            transition-colors
            ${isDisabled
              ? "cursor-not-allowed bg-neutral-borderEmphasis"
              : "bg-primary hover:bg-primary-hover"
            }
          `}
        >
          {isSubmitting ? "Starting..." : `Confirm method`}
        </button>
      </div>
    </main>
  );
}