import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadPlot } from "./downloadPlot";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadPlot", () => {
  it("fetches the blob and triggers a named download", async () => {
    const blob = new Blob(["data"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }),
    );
    const createObjectURL = vi.fn().mockReturnValue("blob:url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadPlot("/api/v1/plot.pdf", "plot.pdf");

    expect(fetch).toHaveBeenCalledWith("/api/v1/plot.pdf");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:url");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(downloadPlot("/missing.png", "x.png")).rejects.toThrow(/404/);
  });
});
