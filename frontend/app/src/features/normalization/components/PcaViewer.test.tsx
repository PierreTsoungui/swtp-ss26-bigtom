import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PcaViewer from "./PcaViewer";
import type { PcaData } from "../types";
import { exportSvgAsPng } from "../../../shared/plots/exportSvg";
import { exportSvgAsPdf } from "../../../shared/plots/exportSvgAsPdf";

vi.mock("../../../shared/plots/exportSvg", () => ({
  exportSvgAsPng: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../shared/plots/exportSvgAsPdf", () => ({
  exportSvgAsPdf: vi.fn().mockResolvedValue(undefined),
}));

const data: PcaData = {
  variance_explained: { pc1: 40, pc2: 25 },
  points: [
    { sample: "s1", group: "A", pc1: -1, pc2: -1 },
    { sample: "s2", group: "A", pc1: 0, pc2: 0 },
    { sample: "s3", group: "B", pc1: 1, pc2: 1 },
  ],
};

function renderViewer(onClose = vi.fn()) {
  render(<PcaViewer method="noob" data={data} onClose={onClose} />);
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PcaViewer", () => {
  it("renders the method title and a color control per group", () => {
    renderViewer();

    expect(screen.getByRole("heading", { name: "PCA · NOOB" })).toBeInTheDocument();
    expect(screen.getByLabelText("Color for group A")).toBeInTheDocument();
    expect(screen.getByLabelText("Color for group B")).toBeInTheDocument();
  });

  it("closes via the close button", () => {
    const onClose = renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("adds and removes a per-sample color override", () => {
    renderViewer();

    // No overrides yet.
    expect(screen.queryByText("remove")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Select sample"), { target: { value: "s2" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply color" }));

    // The override list now offers a remove control.
    const removeLink = screen.getByText("remove");
    expect(removeLink).toBeInTheDocument();

    fireEvent.click(removeLink);
    expect(screen.queryByText("remove")).not.toBeInTheDocument();
  });

  it("adds, shows-all and hides-all point labels", () => {
    renderViewer();

    fireEvent.change(screen.getByLabelText("Add a point label"), { target: { value: "s2" } });
    expect(screen.getByRole("button", { name: "Remove label s2" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByRole("button", { name: "Remove label s1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove label s3" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide all" }));
    expect(screen.queryByRole("button", { name: "Remove label s1" })).not.toBeInTheDocument();
  });

  it("removes a single label via its chip", () => {
    renderViewer();

    fireEvent.change(screen.getByLabelText("Add a point label"), { target: { value: "s3" } });
    const chip = screen.getByRole("button", { name: "Remove label s3" });
    fireEvent.click(chip);
    expect(screen.queryByRole("button", { name: "Remove label s3" })).not.toBeInTheDocument();
  });

  it("resets group and sample colors", () => {
    renderViewer();

    fireEvent.click(screen.getByRole("button", { name: "Apply color" }));
    expect(screen.getByText("remove")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset colors" }));
    expect(screen.queryByText("remove")).not.toBeInTheDocument();
  });

  it("exports as PNG and PDF via the export utilities", async () => {
    renderViewer();

    fireEvent.click(screen.getByRole("button", { name: "Export as PNG" }));
    await waitFor(() => expect(exportSvgAsPng).toHaveBeenCalledTimes(1));
    expect(vi.mocked(exportSvgAsPng).mock.calls[0]![1]).toBe("pca_noob.png");

    fireEvent.click(screen.getByRole("button", { name: "Export as PDF" }));
    await waitFor(() => expect(exportSvgAsPdf).toHaveBeenCalledTimes(1));
    expect(vi.mocked(exportSvgAsPdf).mock.calls[0]![1]).toBe("pca_noob.pdf");
  });

  it("surfaces a failed export through the shared error snackbar", async () => {
    vi.mocked(exportSvgAsPng).mockRejectedValueOnce(new Error("boom"));
    // The failure is logged via the shared logger (console.error under the hood);
    // silence it to keep the test output clean.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "Export as PNG" }));

    await waitFor(() =>
      expect(screen.getByText("Could not export the plot as PNG.")).toBeInTheDocument(),
    );
    errorSpy.mockRestore();
  });

  it("labels every sample as an option in the highlight dropdown", () => {
    renderViewer();
    const sampleSelect = screen.getByLabelText("Select sample");
    expect(within(sampleSelect).getAllByRole("option")).toHaveLength(3);
  });
});
