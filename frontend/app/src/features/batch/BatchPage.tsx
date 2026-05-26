import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useBatchCorrection } from "./hooks/useBatchCorrection";
import { useJobPolling } from "../analysis/hooks/useJobPolling";
import { BatchForm } from "./components/BatchForm";
import { BatchStatus } from "./components/BatchStatus";
import { SvdPlot } from "./components/SvdPlot";

export function BatchPage() {
  const { job_id } = useParams<{ job_id: string }>();
  const navigate = useNavigate();
  const jobStatus = useJobPooling(job_id ?? null);
  const { status, error, startCorrection, skipCorrection } = useBatchCorrection(job_id ?? "");

  const [batchVariable, setBatchVariable] = useState("Slide");
  const [covariates, setCovariates] = useState("Sample_Group");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isReadyForBatch = jobStatus?.status === "normalization_done";

  const covariateList = useMemo(
    () => covariates
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    [covariates]
  );

  const handleSubmit = async () => {
    if (!job_id) return;
    setIsSubmitting(true);
    await startCorrection(batchVariable, covariateList);
    setIsSubmitting(false);
  };

  const handleSkip = async () => {
    if (!job_id) return;
    setIsSubmitting(true);
    await skipCorrection();
    setIsSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.9fr_1fr]">
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h1 className="mb-3 text-3xl font-semibold text-slate-900">Batch-Korrektur</h1>
          <p className="mb-6 text-slate-600">
            Hier können Sie die Batch-Korrektur starten. Verwenden Sie die technische Batch-Spalte als
            Korrekturvariable und geben Sie biologische Kovariaten an, die erhalten bleiben sollen.
          </p>

          <BatchStatus
            status={status}
            phase={jobStatus?.phase}
            currentStep={jobStatus?.current_step}
            error={error}
            jobStatus={jobStatus?.status}
          />

          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-xl font-semibold text-slate-900">Erforderliche Eingaben</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li>Normalisierte Daten: Beta-Matrix</li>
                <li>Sample Sheet mit technischen und biologischen Informationen</li>
                <li>Typische Spalten: Slide, Sentrix_ID, Array Position, Sample Well, Batch, Sample Group</li>
              </ul>
            </div>

            <BatchForm
              batchVariable={batchVariable}
              covariates={covariates}
              onBatchVariableChange={setBatchVariable}
              onCovariatesChange={setCovariates}
              onStart={handleSubmit}
              onSkip={handleSkip}
              submitLabel="Batch-Korrektur starten"
              skipLabel="Batch überspringen"
              disabled={!isReadyForBatch || isSubmitting}
              isSubmitting={isSubmitting}
              isReadyForBatch={isReadyForBatch}
            />

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-xl font-semibold text-slate-900">R-Funktionen</h2>
              <p className="mt-3 text-sm text-slate-700">
                Geplante R-Funktionen: <strong>champ.SVD()</strong> für die Batch-Erkennung und
                <strong> champ.runCombat()</strong> für die Korrektur.
              </p>
              <p className="mt-3 text-sm text-slate-700">
                Output: SVD-Plot als PNG und korrigierte Beta-Matrix.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-xl font-semibold text-slate-900">SVD-Plot</h2>
              <p className="mt-2 text-sm text-slate-600">Der Plot wird aus dem Jobverzeichnis geladen.</p>
              <SvdPlot jobId={job_id} />
            </div>
          </div>
        </section>

        <aside className="rounded-3xl bg-slate-900 p-6 text-white shadow-sm">
          <h2 className="mb-4 text-2xl font-semibold">Weiter zur DMP-Analyse</h2>
          <p className="mb-6 text-slate-300">
            Nach der Batch-Korrektur können Sie zur Differentiellen Methylierungs-Analyse (DMP) wechseln.
          </p>

          <button
            onClick={() => navigate(`/analysis/${job_id}`)}
            className="w-full rounded-full bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            Zur DMP-Analyse
          </button>

          <div className="mt-8 space-y-4 rounded-2xl border border-slate-700 bg-slate-800 p-4">
            <h3 className="text-lg font-semibold text-white">Batch-Parameter</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li><strong>batch_variable</strong>: Technische Batch-Spalte, z. B. Slide</li>
              <li><strong>covariates</strong>: Biologische Gruppen, die erhalten bleiben sollen</li>
              <li><strong>logitTrans</strong>: Optional, für Beta-zu-M Transformation</li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
