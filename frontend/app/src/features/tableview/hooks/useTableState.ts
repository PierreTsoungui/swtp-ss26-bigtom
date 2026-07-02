import { useState } from "react";

/** Valid directions for table sorting. */
export type SortOrder = "asc" | "desc" | null;

/**
 * Represents the current sorting configuration for a table.
 */
export type TableSortState = {
  /** The column identifier currently being sorted. */
  sort_by: string | null;
  /** The direction of the sort. */
  sort_order: SortOrder;
};

/**
 * Represents the current pagination state for a table.
 */
export type PaginationState = {
  /** Current active page (1-indexed). */
  page: number;
  /** Number of records to display per page. */
  pageSize: number;
};

/**
 * Manages synchronized state for multiple data tables (DMP and DMR).
 *
 * Handles independent sorting and pagination logic for each table type,
 * including automatic page resets when sorting changes.
 */
export function useTableState() {
  /** Tracks which analysis table is currently visible in the UI. */
  const [activeTab, setActiveTab] =
    useState<"dmp" | "dmr">("dmp");

  /** Independent sorting state for each table type. */
  const [sorting, setSorting] = 
  useState<Record<"dmp" | "dmr",
    TableSortState
  >>({
    dmp: { sort_by: null, sort_order: null },
    dmr: { sort_by: null, sort_order: null },
  });

  /** Independent pagination state for each table type. */
  const [pagination, setPagination] =
    useState<
      Record<"dmp" | "dmr",
        PaginationState
      >
    >({
      dmp: {
        page: 1,
        pageSize: 100,
      },
      dmr: {
        page: 1,
        pageSize: 100,
      },
    });

  /**
   * Updates the sorting criteria for a specific table.
   *
   * Implements a cyclic toggle: None → Ascending → Descending → None.
   * Resets the current page to 1 to ensure data consistency.
   *
   * @param table - The target table ('dmp' or 'dmr').
   * @param column - The column key to sort by.
   */
  const updateSorting = (
    table:"dmp" | "dmr" ,
    column: string
  ) => {
    const current =
      sorting[table];

    let nextOrder: SortOrder =
      "asc";

    if (
      current.sort_by === column
    ) {
      if (
        current.sort_order ===
        "asc"
      ) {
        nextOrder = "desc";
      } else if (
        current.sort_order ===
        "desc"
      ) {
        nextOrder = null;
      }
    }

    setSorting((prev) => ({
      ...prev,
      [table]: {
        sort_by:
          nextOrder === null
            ? null
            : column,
        sort_order: nextOrder,
      },
    }));

    // Pagination zurücksetzen
    setPagination((prev) => ({
      ...prev,
      [table]: {
        ...prev[table],
        page: 1,
      },
    }));
  };

  /**
   * Navigates to a specific page for the given table.
   * @param table - The target table.
   * @param page - The new page number.
   */
  const updatePage = (
  table: "dmp" | "dmr",
  page: number
) => {
  setPagination((prev) => ({
    ...prev,

    [table]: {
      ...prev[table],
      page,
    },
  }));
};

  return {
    activeTab,
    setActiveTab,
    sorting,
    updateSorting,
    pagination,
    updatePage,
  };
}
