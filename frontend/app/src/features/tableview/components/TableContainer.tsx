// features/tableView/components/TableContainer.tsx
import { useParams } from "react-router-dom";

import { TableTabs } from "./TableTabs";
import { TableFilters } from "./TableFilters";
import { AnalysisTable } from "./AnalysisTable";

import { useTableState } from "../hooks/useTableState";
import { useTableData } from "../hooks/useTableData";
import { useTableFilters } from "../hooks/useTableFilters";
import HeatMap from "./heatmap/HeatMap.tsx";

export function TableContainer() {
  const { job_id } = useParams();
  
  
  const { 
    activeTab, 
    setActiveTab, 
    sorting, 
    updateSorting,
    pagination,
    updatePage 
  } = useTableState();
  
  const currentSort = sorting[activeTab];
  const currentPage = pagination[activeTab].page;
  const pageSize = pagination[activeTab].pageSize;
  
  // Filter-State
  const {
    draftFilters,
    appliedFilters,
    updateDraftFilter,
    applyFilters,
    resetFilters,
    hasFilters,
  } = useTableFilters();

  const { data, loading, error } = useTableData(
    job_id ?? null,
    activeTab,
    currentSort.sort_by,
    currentSort.sort_order,
    appliedFilters[activeTab],
    currentPage,
    pageSize
  );

  const handleApplyFilters = () => {
    applyFilters(activeTab);
    // Seite zurücksetzen auf 1 (Filter ändert Ergebnismenge)
    updatePage(activeTab, 1);
  };

  const handleResetFilters = () => {
    resetFilters(activeTab);
    updatePage(activeTab, 1);
  };

  const handleTabChange = (tab: "dmp" | "dmr") => {
    setActiveTab(tab);
 
  };

  const handleSort = (column: string) => {
    updateSorting(activeTab, column);
   
  };

  const handlePageChange = (newPage: number) => {
    updatePage(activeTab, newPage);
  };


  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Tabs */}
      <TableTabs activeTab={activeTab} onChange={handleTabChange} />

      {/* Filter */}
      <div className="mt-4">
        <TableFilters
          table={activeTab}
          filters={draftFilters[activeTab]}
          onChange={(field, value) => updateDraftFilter(activeTab, field, value)}
          onApply={handleApplyFilters}
          onReset={handleResetFilters}
        />
      </div>

      {/* Filter-Status */}
      {hasFilters(activeTab) && (
        <div className="mt-2 text-sm text-blue-600">
          Gefiltert – {data?.pagination?.total_rows || 0} Einträge
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          Fehler: {error}
        </div>
      )}

      {/* Table */}
      {!loading && !error && data && (
        <div className="mt-4">
          <AnalysisTable
            data={data}
            sorting={currentSort}
            onSort={handleSort}
            onPageChange={handlePageChange}
          />
        </div>
      )}

      {/* HeatMap */}
      {activeTab === "dmp" && (
          <div className="flex justify-center py-12 mt-3">
            <HeatMap />
          </div>
      )}
    </div>
  );
}