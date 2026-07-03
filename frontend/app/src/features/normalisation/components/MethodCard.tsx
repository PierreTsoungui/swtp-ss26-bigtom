import type { MethodPlotGroup, NormalizationMethod } from "../utils/types.ts";

/**
 * Props für die MethodCard-Komponente.
 * @property group - Die Daten für die Normalisierungsmethode, einschließlich Name und zugehöriger Plots.
 * @property isSelected - Gibt an, ob die Methode ausgewählt ist.
 * @property onSelect - Funktion, die aufgerufen wird, wenn die Methode ausgewählt wird.
 * @property onImageClick - Funktion, die aufgerufen wird, wenn ein Plot angeklickt wird.
 */
interface PlotCardProps {
    group: MethodPlotGroup;
    isSelected: boolean;
    onSelect: (method: NormalizationMethod) => void;
    onImageClick: (url: string, title: string) => void;
}

/**
 * Komponente als Karten-Layout für die Darstellung der Normalisierungsmethoden und ihrer Plots.
 * Zeigt den Namen der Methode, zwei Plots (Dichte und PCA) und einen Radio-Button zur Auswahl an.
 * Die Plots sind anklickbar, um eine größere Vorschau zu öffnen.
 * @constructor
 */
function MethodCard({ group, isSelected, onSelect, onImageClick }: PlotCardProps) {
    const getPlotByKind = (kind: "density" | "pca") =>
        group.plots.find((p) => p.plot_kind === kind);
    const densityPlot = getPlotByKind("density");
    const scatterPlot = getPlotByKind("pca");

    return (
        <div
            className={`rounded-xl border-2 p-3 shadow-sm transition-all ${
                isSelected
                    ? "border-primary bg-info-badgeBackground shadow-md"
                    : "border-neutral-borderDefault bg-neutral-card hover:border-neutral-borderEmphasis"
            }`}
        >
            <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide text-neutral-textPrimary">
                    {group.method}
                </span>
                <input
                    type="radio"
                    name="normalization"
                    checked={isSelected}
                    onChange={() => onSelect(group.method)}
                    aria-label={`Select ${group.method} normalization`}
                    className="h-5 w-5 accent-primary"
                />
            </div>

            <div className="mb-3">
                {densityPlot ? (
                    <button
                        type="button"
                        className="block w-full rounded-md border border-neutral-borderEmphasis bg-neutral-card transition hover:border-primary hover:shadow-md focus-visible:border-primary"
                        onClick={() => onImageClick(densityPlot.url, `${group.method.toUpperCase()} - Dichteplot`)}
                        aria-label={`${group.method.toUpperCase()} Dichteplot Vorschau öffnen`}
                    >
                        <img
                            src={densityPlot.url}
                            alt={`${group.method} density`}
                            className="w-full rounded-md"
                        />
                    </button>
                ) : (
                    <div className="flex h-32 w-full items-center justify-center rounded-md border border-neutral-borderDefault bg-neutral-surface text-sm text-neutral-textSecondary">
                        kein Density-Plot
                    </div>
                )}
                <div className="mt-1 text-center text-sm text-neutral-textSecondary">
                    Dichte - Klick für Vorschau
                </div>
            </div>

            <div>
                {scatterPlot ? (
                    <button
                        type="button"
                        className="block w-full rounded-md border border-neutral-borderEmphasis bg-neutral-card transition hover:border-primary hover:shadow-md focus-visible:border-primary"
                        onClick={() => onImageClick(scatterPlot.url, `${group.method.toUpperCase()} - PCA Streudiagramm`)}
                        aria-label={`${group.method.toUpperCase()} PCA Streudiagramm Vorschau öffnen`}
                    >
                        <img
                            src={scatterPlot.url}
                            alt={`${group.method} scatter`}
                            className="w-full rounded-md"
                        />
                    </button>
                ) : (
                    <div className="flex h-32 w-full items-center justify-center rounded-md border border-neutral-borderDefault bg-neutral-surface text-sm text-neutral-textSecondary">
                        kein PCA-Plot
                    </div>
                )}
                <div className="mt-1 text-center text-sm text-neutral-textSecondary">
                    PCA - Klick für Vorschau
                </div>
            </div>

            {group.method === "raw" && (
                <div className="mt-3 text-center text-sm text-neutral-textSecondary">
                    Raw-Daten (ungefiltert)
                </div>
            )}
        </div>
    );
}

export default MethodCard;
