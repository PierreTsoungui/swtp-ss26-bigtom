import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTableData } from "./useTableData";
import type { TableData } from "../types";

const tableData: TableData = {
  columns: [{ key: "cpg", label: "CpG", type: "string", sortable: true }],
  data: [{ cpg: "cg0001" }],
  pagination: { page: 1, page_size: 75, total_pages: 1, total_rows: 1 },
};

/** Builds a minimal `fetch` Response stub. */
function jsonResponse(body: unknown, ok = true, statusCode = 200): Response {
  return { ok, status: statusCode, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useTableData", () => {
  it("does not fetch when the job id is null", () => {
    const { result } = renderHook(() => useTableData(null, "dmp", null, null));
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it("loads table data and encodes sorting, paging and filters as query params", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(tableData));

    const { result } = renderHook(() =>
      useTableData("job-1", "dmp", "adj_p_value", "asc", { gene: "TP53", chr: "" } as never, 2, 50),
    );

    await waitFor(() => expect(result.current.data).toEqual(tableData));

    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toContain("/api/v1/table/job-1/dmp?");
    expect(url).toContain("sort_by=adj_p_value");
    expect(url).toContain("sort_order=asc");
    expect(url).toContain("page=2");
    expect(url).toContain("page_size=50");
    expect(url).toContain("filter_gene=TP53");
    // Empty filter values are omitted.
    expect(url).not.toContain("filter_chr");
    expect(result.current.loading).toBe(false);
  });

  it("exposes a readable error when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(null, false, 500));

    const { result } = renderHook(() => useTableData("job-1", "dmr", null, null));

    await waitFor(() => expect(result.current.error).toBe("Failed to load table"));
    expect(result.current.data).toBeNull();
  });
});
