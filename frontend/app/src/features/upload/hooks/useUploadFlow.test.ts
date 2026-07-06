import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUploadFlow } from "./useUploadFlow";
import { commitUpload, discardUpload, inspectUpload } from "./uploadApi";
import type { InspectManifest, SampleSheetCandidate } from "../types";

vi.mock("./uploadApi", () => ({
  inspectUpload: vi.fn(),
  commitUpload: vi.fn(),
  discardUpload: vi.fn(),
  previewSheet: vi.fn(),
}));

const mockedInspect = vi.mocked(inspectUpload);
const mockedCommit = vi.mocked(commitUpload);
const mockedDiscard = vi.mocked(discardUpload);

const MAPPED_COLUMNS = ["Sentrix_ID", "Sentrix_Position", "Sample_Group", "Sample_Name"];

function sheet(overrides: Partial<SampleSheetCandidate> = {}): SampleSheetCandidate {
  return {
    id: "sheet-1",
    name: "SampleSheet.csv",
    rel_path: "SampleSheet.csv",
    size_bytes: 100,
    recognized: true,
    recommended: true,
    sample_count: 2,
    columns: MAPPED_COLUMNS,
    suggested_mapping: {
      sentrix_id: "Sentrix_ID",
      sentrix_position: "Sentrix_Position",
      sample_group: "Sample_Group",
      sample_name: "Sample_Name",
    },
    ...overrides,
  };
}

function manifest(overrides: Partial<InspectManifest> = {}): InspectManifest {
  return {
    session_id: "sess-1",
    source: "files",
    sample_sheets: [sheet()],
    idats: [
      {
        pair_id: "pair-1",
        grn: { name: "s_Grn.idat", rel_path: "s_Grn.idat", size_bytes: 10 },
        red: { name: "s_Red.idat", rel_path: "s_Red.idat", size_bytes: 10 },
        complete: true,
      },
    ],
    other_files: [],
    errors: [],
    expires_at: "",
    ...overrides,
  };
}

const file = () => new File(["x"], "s_Grn.idat");

beforeEach(() => {
  vi.clearAllMocks();
  mockedInspect.mockResolvedValue(manifest());
  mockedCommit.mockResolvedValue("job-99");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useUploadFlow", () => {
  it("starts in the idle state", () => {
    const { result } = renderHook(() => useUploadFlow(vi.fn()));
    expect(result.current.status).toBe("idle");
    expect(result.current.canCommit).toBe(false);
  });

  it("ignores an empty file selection", () => {
    const { result } = renderHook(() => useUploadFlow(vi.fn()));
    act(() => result.current.inspect([]));
    expect(mockedInspect).not.toHaveBeenCalled();
  });

  it("inspects files, auto-selects the single sheet and prefills the mapping", async () => {
    const { result } = renderHook(() => useUploadFlow(vi.fn()));

    act(() => result.current.inspect([file()]));

    await waitFor(() => expect(result.current.status).toBe("review"));
    expect(result.current.selectedSheetId).toBe("sheet-1");
    expect(result.current.columnMapping.sentrix_id).toBe("Sentrix_ID");
    // Complete mapping + a complete pair → ready to commit.
    expect(result.current.canCommit).toBe(true);
    expect(result.current.blockingError).toBeNull();
  });

  it("reports a blocking error when no sample sheet is detected", async () => {
    mockedInspect.mockResolvedValue(manifest({ sample_sheets: [] }));
    const { result } = renderHook(() => useUploadFlow(vi.fn()));

    act(() => result.current.inspect([file()]));

    await waitFor(() => expect(result.current.status).toBe("review"));
    expect(result.current.blockingError).toMatch(/No sample sheet detected/);
    expect(result.current.canCommit).toBe(false);
  });

  it("reports a blocking error when no complete IDAT pair exists", async () => {
    mockedInspect.mockResolvedValue(
      manifest({ idats: [{ pair_id: "p", grn: null, red: null, complete: false }] }),
    );
    const { result } = renderHook(() => useUploadFlow(vi.fn()));

    act(() => result.current.inspect([file()]));

    await waitFor(() => expect(result.current.blockingError).toMatch(/No complete IDAT pair/));
  });

  it("hints the user to complete the mapping when a role is missing", async () => {
    mockedInspect.mockResolvedValue(
      manifest({
        sample_sheets: [
          sheet({
            suggested_mapping: {
              sentrix_id: "Sentrix_ID",
              sentrix_position: "Sentrix_Position",
              sample_group: "Sample_Group",
              sample_name: null,
            },
          }),
        ],
      }),
    );
    const { result } = renderHook(() => useUploadFlow(vi.fn()));

    act(() => result.current.inspect([file()]));

    await waitFor(() => expect(result.current.status).toBe("review"));
    expect(result.current.canCommit).toBe(false);
    expect(result.current.selectionHint).toMatch(/Assign all four column roles/);

    // Completing the role clears the hint and enables commit.
    act(() => result.current.setRole("sample_name", "Sample_Name"));
    expect(result.current.canCommit).toBe(true);
  });

  it("surfaces an inspection error and returns to idle", async () => {
    mockedInspect.mockRejectedValue(new Error("Unreadable ZIP"));
    const { result } = renderHook(() => useUploadFlow(vi.fn()));

    act(() => result.current.inspect([file()]));

    await waitFor(() => expect(result.current.error).toBe("Unreadable ZIP"));
    expect(result.current.status).toBe("idle");
  });

  it("commits the selection and reports the started job", async () => {
    const onStarted = vi.fn();
    const { result } = renderHook(() => useUploadFlow(onStarted));

    act(() => result.current.inspect([file()]));
    await waitFor(() => expect(result.current.canCommit).toBe(true));

    await act(async () => {
      await result.current.commit();
    });

    expect(mockedCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: "sess-1",
        selected_sample_sheet_id: "sheet-1",
        selected_pair_ids: ["pair-1"],
      }),
    );
    expect(onStarted).toHaveBeenCalledWith("job-99");
  });

  it("keeps the user in review with an error when commit fails", async () => {
    mockedCommit.mockRejectedValue(new Error("Server busy"));
    const { result } = renderHook(() => useUploadFlow(vi.fn()));

    act(() => result.current.inspect([file()]));
    await waitFor(() => expect(result.current.canCommit).toBe(true));

    await act(async () => {
      await result.current.commit();
    });

    expect(result.current.status).toBe("review");
    expect(result.current.error).toBe("Server busy");
  });

  it("removes a pair from the visible list", async () => {
    const { result } = renderHook(() => useUploadFlow(vi.fn()));
    act(() => result.current.inspect([file()]));
    await waitFor(() => expect(result.current.visiblePairs).toHaveLength(1));

    act(() => result.current.removePair("pair-1"));
    expect(result.current.visiblePairs).toHaveLength(0);
  });

  it("resets the flow and discards the staging session", async () => {
    const { result } = renderHook(() => useUploadFlow(vi.fn()));
    act(() => result.current.inspect([file()]));
    await waitFor(() => expect(result.current.status).toBe("review"));

    act(() => result.current.reset());

    expect(result.current.status).toBe("idle");
    expect(result.current.manifest).toBeNull();
    expect(mockedDiscard).toHaveBeenCalledWith("sess-1");
  });
});
