import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportSvgAsPdf } from "./exportSvgAsPdf";

const svgMethod = vi.fn().mockResolvedValue(undefined);
const saveMethod = vi.fn();
// Must be a normal function (not an arrow) so it is usable with `new`.
const jsPDFConstructor = vi.fn(function jsPDFMock() {
  return { svg: svgMethod, save: saveMethod };
});

// The exporter lazily imports these heavy libraries; mock both so no real PDF
// toolchain is loaded during the test.
vi.mock("jspdf", () => ({ jsPDF: jsPDFConstructor }));
vi.mock("svg2pdf.js", () => ({}));

function makeSvg(): SVGSVGElement {
  return document.createElementNS("http://www.w3.org/2000/svg", "svg");
}

beforeEach(() => {
  vi.clearAllMocks();
  svgMethod.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exportSvgAsPdf", () => {
  it("creates a page sized to the plot and saves it", async () => {
    const svg = makeSvg();
    await exportSvgAsPdf(svg, "plot.pdf", 800, 600);

    expect(jsPDFConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ unit: "px", format: [800, 600], orientation: "landscape" }),
    );
    expect(svgMethod).toHaveBeenCalledWith(svg, { x: 0, y: 0, width: 800, height: 600 });
    expect(saveMethod).toHaveBeenCalledWith("plot.pdf");
  });

  it("uses portrait orientation when the plot is taller than wide", async () => {
    await exportSvgAsPdf(makeSvg(), "tall.pdf", 400, 900);
    expect(jsPDFConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ orientation: "portrait" }),
    );
  });
});
