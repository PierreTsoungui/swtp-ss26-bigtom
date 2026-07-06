/** Export formats available for every static, server-rendered plot. */
export type PlotFormat = "png" | "pdf";

/**
 * Describes a single static plot that is rendered server-side (by an R script)
 * and made available by the backend as both a PNG (for inline display and
 * export) and a PDF (for export).
 *
 * This is the one contract every plot in the app conforms to. As long as a
 * feature can produce a {@link PlotSource}, it gets identical display, hover,
 * zoom and export behaviour for free via {@link PlotView}.
 */
export interface PlotSource {
  /** URL of the PNG shown inline and downloaded for a PNG export. */
  pngUrl: string;
  /** URL of the PDF downloaded for a PDF export. */
  pdfUrl: string;
  /** Caption / accessible label for the figure. */
  title: string;
  /** Base file name (without extension) used for downloaded files. */
  downloadName: string;
}

/** Resolves the source URL for a given export format. */
export function urlForFormat(source: PlotSource, format: PlotFormat): string {
  return format === "pdf" ? source.pdfUrl : source.pngUrl;
}
