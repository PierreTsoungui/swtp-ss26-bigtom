import { useState } from "react";

export type SortOrder = "asc" | "desc" | null;

export type TableSortState = {
  sort_by: string | null;
  sort_order: SortOrder;
};

export function useTableState() {
  const [activeTab, setActiveTab] =
    useState<"dmp" | "dmr">("dmp");

  const [sorting, setSorting] = useState<Record<
    "dmp" | "dmr",
    TableSortState
  >>({
    dmp: { sort_by: null, sort_order: null },
    dmr: { sort_by: null, sort_order: null },
  });

  const updateSorting = (
    table: "dmp" | "dmr",
    column: string
  ) => {
    setSorting((prev) => {
      const current = prev[table];

      // 🔁 Cycle Logic
      let newOrder: SortOrder = "asc";

      if (current.sort_by !== column) {
        newOrder = "asc"; // neue Spalte
      } else if (current.sort_order === "asc") {
        newOrder = "desc";
      } else if (current.sort_order === "desc") {
        newOrder = null;
      } else {
        newOrder = "asc";
      }

      return {
        ...prev,
        [table]: {
          sort_by: newOrder ? column : null,
          sort_order: newOrder,
        },
      };
    });
  };

  return {
    activeTab,
    setActiveTab,
    sorting,
    updateSorting,
  };
}