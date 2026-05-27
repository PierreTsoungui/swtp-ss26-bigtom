import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import type { MethodPlotGroup, NormalizationMethod } from "./utils/types";
import { useNormalizationPreview } from "./hooks/useNormalizationPreview";

// Modal Component für Plot-Vorschau
function PlotModal({ 
  imageUrl, 
  title, 
  onClose 
}: { 
  imageUrl: string; 
  title: string; 
  onClose: () => void;
}) {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="relative max-h-[90vh] max-w-[90vw] bg-white rounded-xl shadow-2xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white shadow-md hover:bg-slate-100 flex items-center justify-center text-lg font-bold"
        >
          ✕
        </button>
        <img
          src={imageUrl}
          alt={title}
          className="max-h-[85vh] w-auto rounded-md"
        />
        <p className="mt-2 text-center text-sm text-slate-600">{title}</p>
      </div>
    </div>
  );
}

export function NormalizationPage() {
  const { job_id } = useParams<{ job_id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useNormalizationPreview(job_id ?? null);

  const [selected, setSelected] = useState<NormalizationMethod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State für Modal-Vorschau
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

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

      navigate(`/analysis/${job_id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">
          Normalisierungsvorschauen werden geladen...
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-red-500">{error}</p>
      </main>
    );
  }

  if (!data) return null;

  const getPlotByKind = (methodGroup: MethodPlotGroup, kind: "density" | "pca") => {
    return methodGroup.plots.find((p) => p.plot_kind === kind);
  };

  const handleImageClick = (url: string, title: string) => {
    setPreviewImage({ url, title });
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      {/* MODAL für Plot-Vorschau */}
      {previewImage && (
        <PlotModal
          imageUrl={previewImage.url}
          title={previewImage.title}
          onClose={() => setPreviewImage(null)}
        />
      )}

      <h1 className="mb-2 text-2xl font-semibold text-slate-900">
        Normalisierungsmethode auswählen
      </h1>
      <p className="mb-8 text-slate-500">
        Klicken Sie auf einen Plot für eine vergrößerte Ansicht
      </p>

      {/* METHOD CARDS (5 methods) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-10">
        {data.plots.map((group) => {
          const isRaw = group.method === "raw";
          const isSelected = selected === group.method;

          const densityPlot = getPlotByKind(group, "density");
          const scatterPlot = getPlotByKind(group, "pca");

          return (
            <div
              key={group.method}
              className={`
                rounded-xl border-2 p-3 transition-all shadow-sm
                ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }
              `}
            >
              {/* HEADER mit Radio */}
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide">
                  {group.method}
                </span>
                <input
                  type="radio"
                  name="normalization"
                  value={group.method}
                  checked={selected === group.method}
                  onChange={() => setSelected(group.method)}
                  className="h-4 w-4"
                />
              </div>

              {/* DENSITY PLOT (klickbar für Vorschau) */}
              <div className="mb-3">
                {densityPlot ? (
                  <img
                    src={densityPlot.url}
                    alt={`${group.method} density plot`}
                    className="w-full rounded-md border bg-white cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleImageClick(densityPlot.url, `${group.method.toUpperCase()} - Dichteplot`)}
                  />
                ) : (
                  <div className="w-full rounded-md border bg-slate-100 h-32 flex items-center justify-center text-xs text-slate-400">
                    kein Density-Plot
                  </div>
                )}
                <div className="text-[10px] text-slate-400 mt-1 text-center">
                  Dichte • klick zum Vergrößern
                </div>
              </div>

              {/* SCATTER PLOT (klickbar für Vorschau) */}
              <div>
                {scatterPlot ? (
                  <img
                    src={scatterPlot.url}
                    alt={`${group.method} scatter plot`}
                    className="w-full rounded-md border bg-white cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleImageClick(scatterPlot.url, `${group.method.toUpperCase()} - PCA Streudiagramm`)}
                  />
                ) : (
                  <div className="w-full rounded-md border bg-slate-100 h-32 flex items-center justify-center text-xs text-slate-400">
                    kein PCA-Plot
                  </div>
                )}
                <div className="text-[10px] text-slate-400 mt-1 text-center">
                  PCA Streudiagramm • klick zum Vergrößern
                </div>
              </div>

              {/* INFO TEXT für RAW */}
              {isRaw && (
                <div className="mt-3 text-xs text-slate-400 text-center">
                  Raw-Daten (ungefiltert)
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CONFIRM BUTTON */}
      <div className="flex justify-center">
        <button
          onClick={handleConfirm}
          disabled={!selected || isSubmitting}
          className={`
            rounded-full px-10 py-3 font-bold text-white
            transition-colors
            ${!selected || isSubmitting
              ? "cursor-not-allowed bg-slate-300"
              : "bg-blue-600 hover:bg-blue-700"
            }
          `}
        >
          {isSubmitting ? "Wird gestartet..." : `Methode bestätigen`}
        </button>
      </div>
    </main>
  );
}