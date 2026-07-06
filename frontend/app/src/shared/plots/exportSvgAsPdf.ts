/**
 * Exports an in-browser SVG element as a true vector PDF (NRM-04).
 *
 * Unlike the PNG path (see ``exportSvgAsPng``), which rasterises the plot onto a
 * canvas, this keeps the plot as vector graphics all the way into the PDF:
 * ``svg2pdf.js`` walks the SVG DOM and emits native PDF drawing primitives, so
 * the result stays infinitely scalable and publication-grade — matching the PDF
 * exports produced by the R backend for every other plot.
 *
 * ``jspdf`` and ``svg2pdf.js`` are heavy, so they are loaded lazily via dynamic
 * ``import()``. That keeps them out of the main bundle; they are fetched only
 * when a user actually exports a PDF.
 *
 * @param svg      The mounted SVG element to export (e.g. a plot ref's current).
 * @param filename File name offered to the user, including the ``.pdf`` suffix.
 * @param width    Logical SVG width in px; also the PDF page width.
 * @param height   Logical SVG height in px; also the PDF page height.
 * @throws Error when PDF generation fails.
 */
export async function exportSvgAsPdf(
  svg: SVGSVGElement,
  filename: string,
  width: number,
  height: number,
): Promise<void> {
  // Loaded on demand so the ~PDF toolchain never lands in the initial bundle.
  const [{ jsPDF }] = await Promise.all([
    import("jspdf"),
    // Importing for its side effect: it augments jsPDF with a `.svg()` method.
    import("svg2pdf.js"),
  ]);

  // The page is sized to the plot in pixels (1:1), so no scaling artefacts are
  // introduced. Orientation follows the aspect ratio to avoid jsPDF swapping the
  // page dimensions on us.
  const pdf = new jsPDF({
    unit: "px",
    format: [width, height],
    orientation: width >= height ? "landscape" : "portrait",
    hotfixes: ["px_scaling"],
    compress: true,
  });

  await pdf.svg(svg, { x: 0, y: 0, width, height });
  pdf.save(filename);
}
