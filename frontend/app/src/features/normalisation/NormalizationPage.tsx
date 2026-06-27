import {useEffect, useMemo, useState} from "react";
import { useParams, useNavigate } from "react-router";
import type { MethodPreview, NormalizationMethod } from "./utils/types";
import { METHOD_ORDER } from "./utils/types";
import { useNormalizationPreview } from "./hooks/useNormalizationPreview";
import {useJobPolling} from "../analysis/hooks/useJobPolling.ts";
import Progressbar from "../../shared/components/Progressbar.tsx";
import PlotModal from "./components/PlotModal.tsx";
import PcaViewer from "./components/PcaViewer.tsx";
import LoadingScreen from "./components/LoadingScreen.tsx";
import MethodCard from "./components/MethodCard.tsx";
import {JobPhase, type JobStatus, JobStatusValue} from "../../shared/utils/JobTypes.ts";
import HelpButton from "../../shared/help/HelpButton.tsx";


/**
 * Page zur Auswahl der Normalisierungsmethode.
 * Zeigt für jede Methode zwei Plots (Dichte und PCA) als Vorschau an.
 * Der Nutzer kann eine Methode auswählen und bestätigen, um die Normalisierung zu starten.
 * Während der Normalisierung wird ein Fortschrittsbalken angezeigt, bis die Batch-Seite geladen wird.
 *
 * @note Die Plots werden als URLs vom Backend geliefert und direkt eingebunden.
 *       Für eine bessere UX können die Plots angeklickt werden, um sie in einem Modal zu vergrößern.
 *
 * @returns JSX.Element
 */
export function NormalizationPage() {
  const { job_id } = useParams<{ job_id: string }>();
  console.log("[NormalizationPage] job_id aus Params:", job_id);
  const navigate = useNavigate();

  const { data, isLoading, error } = useNormalizationPreview(job_id ?? null);
  const [selected, setSelected] = useState<NormalizationMethod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [pcaMethod, setPcaMethod] = useState<MethodPreview | null>(null);
  const [isNormalising, setIsNormalising] = useState(false);

  // Feste Spaltenreihenfolge mit RAW ganz links (NRM-01); unbekannte Methoden
  // werden hinten angehängt, damit nichts verloren geht.
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
      console.log("[NormalizationPage] useEffect - jobStatus:", jobStatus?.status, "job_id:", job_id);
      if (!jobStatus) return;
      if (jobStatus.status === JobStatusValue.WAITING && jobStatus.phase === JobPhase.BATCH) {
        console.log("Navigiere zu /batch/", job_id, "aktueller jobStatus:", jobStatus);
        navigate(`/batch/${job_id}`);
      }
  }, [jobStatus?.status, job_id, navigate]);

  const handleConfirm = async () => {
    if (!selected || !job_id) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/v1/normalize/${job_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: selected }),
      });

      if (!res.ok) throw new Error(`Error: ${res.status}`);
      setIsNormalising(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) { return <LoadingScreen message="Loading normalization previews..." /> }
  if (error) { return <LoadingScreen message={error} /> }
  if (!data) return null;

  const handleDensityClick = (url: string, title: string) => {
    setPreviewImage({ url, title });
  };

  const isDisabled : boolean = !selected || isSubmitting || isNormalising;

  return (
    <main className="min-h-screen bg-neutral-background px-6 py-10">
      {/* MODAL für vergrößerten Density-Plot */}
      {previewImage && (
        <PlotModal
          imageURL={previewImage.url}
          title={previewImage.title}
          onClose={() => setPreviewImage(null)}
        />
      )}

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
                onDensityClick={handleDensityClick}
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