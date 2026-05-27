import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResultsTable } from "../hooks/useResultsTable";
import type { ResultsTableResponse } from "../utils/types";

const validResponse: ResultsTableResponse = {
  columns: ["CpG", "Chromosome", "BetaValue"],
  rows: [
    {
      CpG: "cg000001",
      Chromosome: "chr1",
      BetaValue: 0.82,
    },
  ],
  page: 1,
  page_size: 100,
  total_rows: 1,
};

describe("useResultsTable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("laedt Daten korrekt", async () => {
    const fetchMock = mockFetch(validResponse);

    const { result } = renderHook(() =>
      useResultsTable("job-123", "normalization_done")
    );

    await waitFor(() => expect(result.current.data).toEqual(validResponse));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(getFetchUrl(fetchMock, 0)).toBe("/data/job-123?page=1&page_size=100");
    expect(getFetchSignal(fetchMock, 0)).toBeInstanceOf(AbortSignal);
  });

  it("veraendert Request-Parameter bei Sortierung", async () => {
    const fetchMock = mockFetch(validResponse);

    const { result } = renderHook(() =>
      useResultsTable("job-123", "normalization_done")
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setSorting({ column: "BetaValue", order: "desc" });
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(getFetchUrl(fetchMock, 1)).toBe(
      "/data/job-123?page=1&page_size=100&sort=BetaValue&order=desc"
    );
  });

  it("faengt fehlerhafte API-Responses ab", async () => {
    mockFetch({
      columns: ["CpG"],
      page: 1,
      page_size: 100,
      total_rows: 1,
    });

    const { result } = renderHook(() =>
      useResultsTable("job-123", "normalization_done")
    );

    await waitFor(() =>
      expect(result.current.error).toBe(
        "Die Ergebnistabelle konnte nicht verarbeitet werden."
      )
    );

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});

function mockFetch(body: unknown) {
  const fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function getFetchUrl(fetchMock: ReturnType<typeof mockFetch>, callIndex: number): string {
  const call = fetchMock.mock.calls[callIndex];
  const input = call?.[0];

  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return "";
}

function getFetchSignal(
  fetchMock: ReturnType<typeof mockFetch>,
  callIndex: number
): AbortSignal | null {
  const call = fetchMock.mock.calls[callIndex];
  const init = call?.[1];

  if (!init || !("signal" in init) || !(init.signal instanceof AbortSignal)) {
    return null;
  }

  return init.signal;
}
