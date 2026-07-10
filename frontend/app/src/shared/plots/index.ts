/**
 * Public API of the shared `plots` module.
 *
 * Every static, server-rendered plot in the app conforms to the {@link PlotSource}
 * contract and gets identical display, zoom and PNG/PDF export behaviour through
 * these components. Features import from here rather than from the internal files.
 */
export { default as PlotView } from "./PlotView";
export { default as PlotFigure } from "./PlotFigure";
export { default as PlotLightbox } from "./PlotLightbox";
export { default as PlotExportButtons } from "./PlotExportButtons";
export { downloadPlot } from "./downloadPlot";
export { urlForFormat, type PlotSource, type PlotFormat } from "./types";
