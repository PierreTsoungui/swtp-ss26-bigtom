import { useParams } from "react-router";

import { TableTabs } from "./TableTabs";
import { AnalysisTable } from "./AnalysisTable";

import { useTableState } from "../hooks/useTableState";
import { useTableData } from "../hooks/useTableData";
import { TableFilters } from "./TableFilters";

import { useTableFilters } from "../hooks/useTableFilters";

export function TableContainer() {
  const { job_id } = useParams();

  const {
    activeTab,
    setActiveTab,
    sorting,
    updateSorting,
  } = useTableState();

  const {
    draftFilters,
    appliedFilters,
    setDraftFilters,
    applyFilters,
    resetFilters,
  } = useTableFilters();

  const currentSort = sorting[activeTab];

  const {
    data,
    loading,
    error,
  } = useTableData(
    job_id ?? null,
    activeTab,
    currentSort.sort_by,
    currentSort.sort_order,
    appliedFilters[activeTab]
  );

  return (
    <div className="w-full max-w-5xl mx-auto">
      <TableTabs
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <TableFilters
        filters={draftFilters[activeTab]}
        onChange={(filters) =>
          setDraftFilters((prev) => ({
            ...prev,
            [activeTab]: filters,
          }))
        }
        onApply={() =>
          applyFilters(activeTab)
        }
        onReset={() =>
          resetFilters(activeTab)
        }
      />
      {loading && (
        <p>Loading table...</p>
      )}

      {error && (
        <p className="text-red-500">
          {error}
        </p>
      )}
      <AnalysisTable
        data={data}
        sorting={currentSort}
        onSort={(column) =>
          updateSorting(activeTab, column)
        }
      />
    </div>
  );
}