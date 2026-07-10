import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportTableCsv } from "./exportTableCsv";

const createObjectURL = vi.fn(() => "blob:mock");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  window.URL.createObjectURL = createObjectURL;
  window.URL.revokeObjectURL = revokeObjectURL;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("exportTableCsv", () => {
  it("fetches the export URL with the given params and triggers a download", async () => {
    const blob = new Blob(["a,b\n1,2"], { type: "text/csv" });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(blob),
    } as Response);

    const params = new URLSearchParams({ sort_by: "gene", filter_gene: "TP53" });
    await exportTableCsv("job-1", "dmp", params);

    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toBe("/api/v1/table/job-1/dmp/export?sort_by=gene&filter_gene=TP53");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("throws a descriptive error on a failed response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);

    await expect(exportTableCsv("job-1", "dmr", new URLSearchParams())).rejects.toThrow(
      "CSV export failed (HTTP 503)",
    );
  });
});
