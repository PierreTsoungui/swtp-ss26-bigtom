import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportSvgAsPng } from "./exportSvg";

/**
 * Drives the async `Image` used by the exporter: assigning `src` resolves on the
 * next microtask by invoking `onload` (or `onerror` in failure mode).
 */
let imageMode: "load" | "error" = "load";
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    void Promise.resolve().then(() => {
      if (imageMode === "error") this.onerror?.();
      else this.onload?.();
    });
  }
}

const ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
let getContextResult: unknown = ctx;
let toBlobResult: Blob | null = new Blob(["x"], { type: "image/png" });

const createObjectURL = vi.fn(() => "blob:mock");
const revokeObjectURL = vi.fn();

function makeSvg(): SVGSVGElement {
  return document.createElementNS("http://www.w3.org/2000/svg", "svg");
}

beforeEach(() => {
  imageMode = "load";
  getContextResult = ctx;
  toBlobResult = new Blob(["x"], { type: "image/png" });

  vi.stubGlobal("Image", MockImage);

  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return {
        width: 0,
        height: 0,
        getContext: () => getContextResult,
        toBlob: (cb: (blob: Blob | null) => void) => cb(toBlobResult),
      } as unknown as HTMLCanvasElement;
    }
    return realCreate(tag);
  });

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("exportSvgAsPng", () => {
  it("renders the SVG to a canvas and triggers a download", async () => {
    await expect(exportSvgAsPng(makeSvg(), "plot.png", 100, 80, 2)).resolves.toBeUndefined();
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledWith(toBlobResult);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("rejects when the canvas 2D context is unavailable", async () => {
    getContextResult = null;
    await expect(exportSvgAsPng(makeSvg(), "plot.png", 100, 80)).rejects.toThrow(
      "Canvas context not available",
    );
  });

  it("rejects when the canvas produces no blob", async () => {
    toBlobResult = null;
    await expect(exportSvgAsPng(makeSvg(), "plot.png", 100, 80)).rejects.toThrow(
      "PNG export failed",
    );
  });

  it("rejects when the SVG cannot be rendered", async () => {
    imageMode = "error";
    await expect(exportSvgAsPng(makeSvg(), "plot.png", 100, 80)).rejects.toThrow(
      "SVG could not be rendered",
    );
  });
});
