import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import type {NormalizationMethod} from "./utils/types.ts";
import {useNormalizationPreview} from "./hooks/useNormalizationPreview.ts";

export function NormalizationPage() {
    const { job_id } = useParams<{ job_id: string }>();
    const navigate = useNavigate();
    const { data, isLoading, error } = useNormalizationPreview(job_id ?? null);
    const [selected, setSelected] = useState<NormalizationMethod | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleConfirm = async () => {
        if (!selected || !job_id) return;
        setIsSubmitting(true);
        try {
            const res = await fetch(`normalize/${job_id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ method: selected }),
            });
            if (!res.ok) throw new Error(`Fehler: ${res.status}`);
            navigate(`/analysis/${job_id}`); // zurück zum Ladescreen
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Ladescreen während Plots berechnet werden
    if (isLoading) {
        return (
            <main className="flex min-h-screen items-center justify-center">
                <p className="text-slate-500">Normalisierungsvorschauen werden geladen...</p>
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

    return (
        <main className="min-h-screen bg-slate-50 px-6 py-10">
            <h1 className="mb-2 text-2xl font-semibold text-slate-900">
                Normalisierungsmethode auswählen
            </h1>
            <p className="mb-8 text-slate-500">
                Empfohlen: <strong>{data.recommendation}</strong>
            </p>

            {/* 5 Plots nebeneinander */}
            <div className="grid grid-cols-5 gap-4 mb-8">
                {data.methods.map((method) => {
                    const plot = data.plots[method];
                    return (
                        <label
                            key={method}
                            className={`cursor-pointer rounded-lg border-2 p-3 transition-colors ${
                                selected === method
                                    ? "border-blue-500 bg-blue-50"
                                    : "border-slate-200 bg-white"
                            }`}
                        >
                            <img
                                src={`data:image/png;base64,${plot.plot_base64}`}
                                alt={`Normalisierung: ${method}`}
                                className="w-full rounded"
                            />
                            <div className="mt-2 flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="normalization"
                                    value={method}
                                    checked={selected === method}
                                    onChange={() => setSelected(method)}
                                />
                                <span className="text-sm font-medium">{method}</span>
                                {plot.quality_score !== undefined && (
                                    <span className="ml-auto text-xs text-slate-400">
                    {plot.quality_score.toFixed(2)}
                  </span>
                                )}
                            </div>
                        </label>
                    );
                })}
            </div>

            {/* Bestätigen */}
            <div className="flex justify-center">
                <button
                    onClick={handleConfirm}
                    disabled={!selected || isSubmitting}
                    className="rounded-full bg-blue-600 px-10 py-3 font-bold text-white
                     transition-colors hover:bg-blue-700
                     disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                    {isSubmitting ? "Wird gestartet..." : "Methode bestätigen"}
                </button>
            </div>
        </main>
    );
}