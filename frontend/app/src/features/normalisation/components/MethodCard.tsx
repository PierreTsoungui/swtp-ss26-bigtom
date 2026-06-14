import type {MethodPlotGroup, NormalizationMethod} from "../utils/types.ts";

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
    const getPlotByKind = (kind: 'density' | 'pca') => group.plots.find((p) => p.plot_kind === kind);
    const densityPlot = getPlotByKind('density');
    const scatterPlot = getPlotByKind('pca');

    return (
        <div className={`rounded-xl border-2 p-3 transition-all shadow-sm ${
            isSelected ? 'border-primary bg-info-badgeBackground shadow-md' : 'border-neutral-borderDefault bg-neutral-card hover:border-neutral-borderEmphasis'
        }`}>
            <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide">{group.method}</span>
                <input
                    type="radio"
                    name="normalization"
                    checked={isSelected}
                    onChange={() => onSelect(group.method)}
                    className="h-4 w-4"
                />
            </div>

            {/* Density Plot */}
            <div className="mb-3">
                {densityPlot ? (
                    <img
                        src={densityPlot.url}
                        alt={`${group.method} density`}
                        className="w-full rounded-md border bg-neutral-card cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => onImageClick(densityPlot.url, `${group.method.toUpperCase()} - Dichteplot`)}
                    />
                ) : (
                    <div className="w-full rounded-md border bg-neutral-surface h-32 flex items-center justify-center text-xs text-neutral-textDisabled">
                        kein Density-Plot
                    </div>
                )}
                <div className="text-[10px] text-neutral-textDisabled mt-1 text-center">Dichte • Klick für Vorschau</div>
            </div>

            {/* Scatter Plot */}
            <div>
                {scatterPlot ? (
                    <img
                        src={scatterPlot.url}
                        alt={`${group.method} scatter`}
                        className="w-full rounded-md border bg-neutral-card cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => onImageClick(scatterPlot.url, `${group.method.toUpperCase()} - PCA Streudiagramm`)}
                    />
                ) : (
                    <div className="w-full rounded-md border bg-neutral-surface h-32 flex items-center justify-center text-xs text-neutral-textDisabled">
                        kein PCA-Plot
                    </div>
                )}
                <div className="text-[10px] text-neutral-textDisabled mt-1 text-center">PCA • Klick für Vorschau</div>
            </div>

            {group.method === 'raw' && (
                <div className="mt-3 text-xs text-neutral-textDisabled text-center">Raw-Daten (ungefiltert)</div>
            )}
        </div>
    );
}

export default MethodCard;
