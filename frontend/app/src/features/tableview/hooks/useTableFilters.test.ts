import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useTableFilters } from "./useTableFilters";

describe("useTableFilters", () => {
  it("starts empty", () => {
    const { result } =
      renderHook(() =>
        useTableFilters()
      );

    expect(
      result.current.appliedFilters.dmp.chromosome
    ).toBe("");
  });

  /*it("applies filters", () => {
    const { result } =
      renderHook(() =>
        useTableFilters()
      );

    act(() => {
      result.current.setDraftFilters({
        dmp: {
          chromosome: "1",
          start: "100",
          stop: "500",
          dmrId: "",
          pValue: "",
          adjPValue: "",
        },

        dmr:
          result.current.draftFilters.dmr,
      });
    });

    act(() => {
      result.current.applyFilters(
        "dmp"
      );
    });

    expect(
      result.current.appliedFilters.dmp.chromosome
    ).toBe("1");
  });*/

  it("resets filters", () => {
    const { result } =
      renderHook(() =>
        useTableFilters()
      );

    act(() => {
      result.current.resetFilters(
        "dmp"
      );
    });

    expect(
      result.current.appliedFilters.dmp.chromosome
    ).toBe("");
  });
});