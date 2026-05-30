import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useTableState } from "./useTableState";

describe("useTableState", () => {
  it("defaults to dmp tab", () => {
    const { result } =
      renderHook(() => useTableState());

    expect(
      result.current.activeTab
    ).toBe("dmp");
  });

  it("changes active tab", () => {
    const { result } =
      renderHook(() => useTableState());

    act(() => {
      result.current.setActiveTab(
        "dmr"
      );
    });

    expect(
      result.current.activeTab
    ).toBe("dmr");
  });
});