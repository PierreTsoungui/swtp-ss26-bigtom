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



it("cycles sorting: none → asc → desc → none", () => {
  const { result } = renderHook(() =>
    useTableState()
  );

  act(() => {
    result.current.updateSorting("dmp", "gene");
  });

  expect(
    result.current.sorting.dmp.sort_order
  ).toBe("asc");

  act(() => {
    result.current.updateSorting("dmp", "gene");
  });

  expect(
    result.current.sorting.dmp.sort_order
  ).toBe("desc");

  act(() => {
    result.current.updateSorting("dmp", "gene");
  });

  expect(
    result.current.sorting.dmp.sort_order
  ).toBe(null);
});

it("updates page independently per tab", () => {
  const { result } =
    renderHook(() => useTableState());

  act(() => {
    result.current.updatePage(
      "dmp",
      5
    );
  });

  expect(
    result.current.pagination.dmp.page
  ).toBe(5);

  expect(
    result.current.pagination.dmr.page
  ).toBe(1);
});


});