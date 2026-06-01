import { useState } from "react";

export type SortOrder = "asc" | "desc" | null;

export type TableSortState = {
  sort_by: string | null;
  sort_order: SortOrder;
};

export function useTableState() {
  const [activeTab, setActiveTab] = useState<"dmp" | "dmr">("dmp");

  const [sorting, setSorting] = useState<Record<
    "dmp" | "dmr",
    TableSortState
  >>({
    dmp: { sort_by: null, sort_order: null },
    dmr: { sort_by: null, sort_order: null },
  });

  const updateSorting = (table: "dmp" | "dmr", column: string) => {
    setSorting((prev) => {
      const current = prev[table];
      
      let newSortBy: string | null;
      let newSortOrder: SortOrder;
      
      if (current.sort_by !== column) {
  
        newSortBy = column;
        newSortOrder = "asc";
      } else {
       
        if (current.sort_order === "asc") {
          newSortBy = column;
          newSortOrder = "desc";
        } else if (current.sort_order === "desc") {
          newSortBy = null;
          newSortOrder = null;
        } else {
          // none -> asc
          newSortBy = column;
          newSortOrder = "asc";
        }
      }
      
      return {
        ...prev,          
        [table]: {         
          sort_by: newSortBy,
          sort_order: newSortOrder,
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