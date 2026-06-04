import { useNavigate, useParams } from "react-router";
import { useBatchParameters } from "./hooks/useBatchParameters";
import { BatchForm } from "./components/BatchForm";
import { useState, useEffect } from "react";
import type { BatchFormData } from "./utils/types";
import Progressbar from "../../shared/components/Progressbar.tsx";
import {useJobPolling} from "../analysis/hooks/useJobPolling.ts";

export function BatchPage() {
  const { job_id } = useParams<{ job_id: string }>();
  const navigate = useNavigate();

  // ── State Management ───────────────────────────────────────────
  const [showProgressBar, setShowProgressBar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Data Fetching ──────────────────────────────────────────────
  const { parameters, isLoading: parametersLoading } = useBatchParameters(job_id ?? null);
  const jobStatus = useJobPolling(showProgressBar && job_id ? job_id : null);

  // ── Auto-Navigation wenn Batch fertig ──────────────────────────
  useEffect(() => {
    if (!jobStatus || !job_id) return;

    if (
        jobStatus.status === "waiting" &&
        jobStatus.phase === "waiting_selection"
    ) {
      navigate(`/results/${job_id}`);
    }
  }, [jobStatus?.status, jobStatus?.phase, job_id, navigate]);

  if (!job_id) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600">Fehler</h1>
            <p className="mt-2 text-slate-600">Keine Job-ID verfügbar</p>
          </div>
        </main>
    );
  }

  // ── PROGRESSBAR ────────────────────────────────────────────────
  if (showProgressBar) {
    if (!jobStatus) {
      return (
          <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
            <p className="text-slate-600">Verbindung wird aufgebaut...</p>
          </main>
      );
    }

    if (jobStatus.status === "running" || jobStatus.status === "failed") {
      return (
          <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
            <div className="w-full max-w-2xl space-y-4">
              {jobStatus.status === "failed" && (
                  <section className="rounded-lg border-2 border-red-200 bg-red-50 p-4">
                    <p className="font-semibold text-red-900">
                      Fehler bei der Batch-Korrektur
                    </p>
                    <p className="mt-1 text-sm text-red-800">
                      {jobStatus.current_step}
                    </p>
                    <button
                        onClick={() => {
                          setShowProgressBar(false);
                          setIsSubmitting(false);
                        }}
                        className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
                    >
                      ← Zurück
                    </button>
                  </section>
              )}

              <Progressbar
                  jobStatus={jobStatus}
                  onNext={() => {}}
                  showNextButton={false}
                  nextDisabled={true}
              />
            </div>
          </main>
      );
    }
  }

  // ── LADEN DER PARAMETER ────────────────────────────────────────
  if (parametersLoading) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <div className="text-center">
            <p className="text-slate-600">Parameter werden geladen...</p>
          </div>
        </main>
    );
  }

  if (!parameters) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <div className="w-full max-w-2xl rounded-lg border-2 border-red-200 bg-red-50 p-6">
            <h1 className="text-xl font-bold text-red-900">
              Parameter konnten nicht geladen werden
            </h1>
            <button
                onClick={() => navigate(`/analysis/${job_id}`)}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
            >
              Zurück
            </button>
          </div>
        </main>
    );
  }

  // ── HAUPTSEITE: BATCH-FORM ────────────────────────────────────
  return (
      <main className="flex min-h-screen justify-center bg-slate-50 px-6 py-10">
        <div className="w-full max-w-2xl space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Batch-Effekt Analyse
            </h1>
            <p className="text-slate-600">
              Wählen Sie einen technischen Faktor zur Batch-Korrektur aus.
            </p>
          </div>

          {/* Info Box */}
          <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">Batch-Effekte:</span> Pinke
              Quadrate im SVD-Plot deuten auf technische Batch-Effekte hin. Diese
              können optional korrigiert werden.
            </p>
          </div>

          {/* SVD-Plot (wenn vorhanden) */}
          {/* TODO: SVD-Plot Komponente hier einfügen */}

          {/* Batch Form */}
          <div className="rounded-lg border-2 border-slate-200 bg-white p-6">
            <BatchForm
                parameters={parameters}
                isLoading={isSubmitting}
                onSubmit={handleSubmit}
                onSkip={() => navigate(`/results/${job_id}`)}
            />
          </div>
        </div>
      </main>
  );

  async function handleSubmit(data: BatchFormData) {
    if (!job_id) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/v1/batch-correct/${job_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      // ✅ Batch-Korrektur gestartet → Progressbar anzeigen
      setShowProgressBar(true);
    } catch (error) {
      console.error("Fehler beim Starten der Batch-Korrektur:", error);
      alert("Fehler beim Starten der Batch-Korrektur");
      setIsSubmitting(false);
    }
  }
}