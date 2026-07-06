import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTableFilters } from "./useTableFilters";

describe("useTableFilters", () => {
  it("should initialize with completely empty filter structures for both dmp and dmr tabs", () => {
    const { result } = renderHook(() => useTableFilters());

    // Verify initial draft and applied filter structures are empty strings
    expect(result.current.draftFilters.dmp.chr).toBe("");
    expect(result.current.draftFilters.dmp.gene).toBe("");
    expect(result.current.appliedFilters.dmp.chr).toBe("");
    expect(result.current.appliedFilters.dmr.dmrid).toBe("");

    // hasFilters helper should report false initially
    expect(result.current.hasFilters("dmp")).toBe(false);
    expect(result.current.hasFilters("dmr")).toBe(false);
  });

  it("should update draft filters independently and apply them to the final filters state", () => {
    const { result } = renderHook(() => useTableFilters());

    // 1. Mutate a draft field in DMP mode
    act(() => {
      result.current.updateDraftFilter("dmp", "chr", "chr7");
      result.current.updateDraftFilter("dmp", "gene", "TP53");
    });

    // Final applied filters must still remain empty prior to calling applyFilters
    expect(result.current.appliedFilters.dmp.chr).toBe("");
    expect(result.current.draftFilters.dmp.chr).toBe("chr7");
    expect(result.current.draftFilters.dmp.gene).toBe("TP53");

    // 2. Commit draft changes into production
    act(() => {
      result.current.applyFilters("dmp");
    });

    expect(result.current.appliedFilters.dmp.chr).toBe("chr7");
    expect(result.current.appliedFilters.dmp.gene).toBe("TP53");
    expect(result.current.hasFilters("dmp")).toBe(true);

    // DMR state must stay safely untouched
    expect(result.current.appliedFilters.dmr.chr).toBe("");
  });

  it("should reset filters back to clear state and trigger the optional page clearing callback", () => {
    const onResetPageMock = vi.fn();
    const { result } = renderHook(() => useTableFilters(onResetPageMock));

    // Populate and apply filters first
    act(() => {
      result.current.updateDraftFilter("dmr", "dmrid", "DMR_99");
    });
    act(() => {
      result.current.applyFilters("dmr");
    });
    expect(result.current.appliedFilters.dmr.dmrid).toBe("DMR_99");

    // Trigger full clearance reset loop
    act(() => {
      result.current.resetFilters("dmr");
    });

    // Assert states are perfectly empty again
    expect(result.current.draftFilters.dmr.dmrid).toBe("");
    expect(result.current.appliedFilters.dmr.dmrid).toBe("");
    expect(result.current.hasFilters("dmr")).toBe(false);

    // Check that the parent page-resetting callback was called exactly once
    expect(onResetPageMock).toHaveBeenCalledTimes(1);
  });

  it("should function normally when resetting filters without providing an onResetPage hook", () => {
    const { result } = renderHook(() => useTableFilters());

    act(() => {
      result.current.updateDraftFilter("dmp", "chr", "chr1");
      result.current.applyFilters("dmp");
    });

    // Resetting shouldn't throw an error when onResetPage is absent
    expect(() => {
      act(() => {
        result.current.resetFilters("dmp");
      });
    }).not.toThrow();

    expect(result.current.appliedFilters.dmp.chr).toBe("");
  });
});
