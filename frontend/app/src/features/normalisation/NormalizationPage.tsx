import {useEffect, useState} from "react";
import { useParams, useNavigate } from "react-router";
import type { NormalizationMethod } from "./utils/types";
import { useNormalizationPreview } from "./hooks/useNormalizationPreview";
import {useJobPolling} from "../analysis/hooks/useJobPolling.ts";
import Progressbar from "../../shared/components/Progressbar.tsx";
import PlotModal from "./components/PlotModal.tsx";
import LoadingScreen from "./components/LoadingScreen.tsx";
import MethodCard from "./components/MethodCard.tsx";
import {JobPhase, type JobStatus, JobStatusValue} from "../../shared/utils/JobTypes.ts";
import HelpButton from "../analysis/components/HelpButton.tsx";
import {helpTexts} from "../../shared/utils/help/helpTexts.ts";


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
  const [isNormalising, setIsNormalising] = useState(false);

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

      if (!res.ok) throw new Error(`Fehler: ${res.status}`);
      // TODO: Prüfen, wie der State abgefangen wird um die Progressbar anzuzeigen, wenn Preview ausgewählt wurde
      setIsNormalising(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) { return <LoadingScreen message="Normalisierungsvorschauen werden geladen..." /> }
  if (error) { return <LoadingScreen message={error} /> }
  if (!data) return null;

  const handleImageClick = (url: string, title: string) => {
    setPreviewImage({ url, title });
  };

  const isDisabled : boolean = !selected || isSubmitting || isNormalising;

  return (
    <main className="min-h-screen bg-neutral-background px-6 py-10">
      {/* MODAL für Plot-Vorschau */}
      {previewImage && (
        <PlotModal
          imageURL={previewImage.url}
          title={previewImage.title}
          onClose={() => setPreviewImage(null)}
        />
      )}

      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl font-semibold text-neutral-textPrimary">
            Choose a normalization method
        </h1>
        <HelpButton
          helpText={helpTexts.normalization}
          ariaLabel="Open Help with normalization"
          dialogTitle="Normalization"
        />
      </div>
      <p className="mb-8 text-neutral-textSecondary">
          Click a plot for an enlarged view.
      </p>

      {/* METHOD CARDS (5 methods) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-10">
        {data.plots.map((group) => (
            <MethodCard
                group={group}
                isSelected={selected === group.method}
                onSelect={setSelected}
                onImageClick={handleImageClick}
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