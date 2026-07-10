import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTableState } from "./useTableState";

describe("useTableState", () => {
  it("should initialize with default 'dmp' tab", () => {
    const { result } = renderHook(() => useTableState());

    expect(result.current.activeTab).toBe("dmp");
    expect(result.current.pagination.dmp.page).toBe(1);
    expect(result.current.pagination.dmr.page).toBe(1);
  });

  it("should allow changing the active tab state", () => {
    const { result } = renderHook(() => useTableState());

    act(() => {
      result.current.setActiveTab("dmr");
    });

    expect(result.current.activeTab).toBe("dmr");
  });

  it("should cycle sorting orders correctly on successive clicks on the same column (none → asc → desc → none)", () => {
    const { result } = renderHook(() => useTableState());

    // 1. First click: transitions to 'asc'
    act(() => {
      result.current.updateSorting("dmp", "gene");
    });
    expect(result.current.sorting.dmp.sort_by).toBe("gene");
    expect(result.current.sorting.dmp.sort_order).toBe("asc");

    // 2. Second click: transitions to 'desc'
    act(() => {
      result.current.updateSorting("dmp", "gene");
    });
    expect(result.current.sorting.dmp.sort_by).toBe("gene");
    expect(result.current.sorting.dmp.sort_order).toBe("desc");

    // 3. Third click: clears sorting back to null
    act(() => {
      result.current.updateSorting("dmp", "gene");
    });
    expect(result.current.sorting.dmp.sort_by).toBe(null);
    expect(result.current.sorting.dmp.sort_order).toBe(null);
  });

  // NEW TEST
  it("should reset sorting to 'asc' and switch targets when clicking a different column", () => {
    const { result } = renderHook(() => useTableState());

    // Set sorting to 'desc' on 'gene' column first
    act(() => {
      result.current.updateSorting("dmp", "gene");
    });
    act(() => {
      result.current.updateSorting("dmp", "gene");
    });
    expect(result.current.sorting.dmp.sort_by).toBe("gene");
    expect(result.current.sorting.dmp.sort_order).toBe("desc");

    // Click on a different column ('chr') -> should instantly become 'asc' for 'chr'
    act(() => {
      result.current.updateSorting("dmp", "chr");
    });
    expect(result.current.sorting.dmp.sort_by).toBe("chr");
    expect(result.current.sorting.dmp.sort_order).toBe("asc");
  });

  // NEW TEST CASE FOR CHECKING PAGINATION RESET DURING SORT CHANGES
  it("should automatically reset pagination page back to 1 when sorting changes", () => {
    const { result } = renderHook(() => useTableState());

    // Advance page first
    act(() => {
      result.current.updatePage("dmp", 5);
    });
    expect(result.current.pagination.dmp.page).toBe(5);

    // Apply sorting change -> page must reset to 1
    act(() => {
      result.current.updateSorting("dmp", "gene");
    });
    expect(result.current.pagination.dmp.page).toBe(1);
  });

  it("should update page indexes independently per individual tab state", () => {
    const { result } = renderHook(() => useTableState());

    act(() => {
      result.current.updatePage("dmp", 5);
    });

    expect(result.current.pagination.dmp.page).toBe(5);
    expect(result.current.pagination.dmr.page).toBe(1); // DMR remains unaffected
  });
});
