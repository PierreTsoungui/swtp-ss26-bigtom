import { useState } from "react";

export type SortOrder = "asc" | "desc" | null;

export type TableSortState = {
  sort_by: string | null;
  sort_order: SortOrder;
};

export type PaginationState = {
  page: number;
  pageSize: number;
};

export function useTableState() {
  const [activeTab, setActiveTab] =
    useState<"dmp" | "dmr">("dmp");

  const [sorting, setSorting] = 
  useState<Record<"dmp" | "dmr",
    TableSortState
  >>({
    dmp: { sort_by: null, sort_order: null }, dmr: { sort_by: null, sort_order: null },
  });
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
