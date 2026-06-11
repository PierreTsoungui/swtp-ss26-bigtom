// features/tableView/components/TableContainer.tsx
import { useParams } from "react-router-dom";

import { TableTabs } from "./TableTabs";
import { TableFilters } from "./TableFilters";
import { AnalysisTable } from "./AnalysisTable";

import { useTableState } from "../hooks/useTableState";
import { useTableData } from "../hooks/useTableData";
import { useTableFilters } from "../hooks/useTableFilters";
import { TableExportButton } from "./TableExportButton";

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

  const handleDownload = async () => {
  if (!job_id) return;

  const params =
    new URLSearchParams();

  if (
    currentSort.sort_by &&
    currentSort.sort_order
  ) {
    params.append(
      "sort_by",
      currentSort.sort_by
    );

    params.append(
      "sort_order",
      currentSort.sort_order
    );
  }
  // params.append(
  //   "page",
  //   String(currentPage)
  // );
  const filters = appliedFilters[activeTab];

if (filters.chromosome) {
  params.append(
    "filter_chr",
    filters.chromosome
  );
}

if (filters.start) {
  params.append(
    "filter_start",
    filters.start
  );
}

if (filters.stop) {
  params.append(
    "filter_stop",
    filters.stop
  );
}

if (filters.dmrId) {
  params.append(
    "filter_dmr",
    filters.dmrId
  );
}

if (filters.pValue) {
  params.append(
    "filter_p_value",
    filters.pValue
  );
}

if (filters.adjPValue) {
  params.append(
    "filter_adj_p_value",
    filters.adjPValue
  );
}

  try {
    const response =
      await fetch(
        `/api/v1/table/${job_id}/${activeTab}/export?${params.toString()}`
      );

    if (!response.ok) {
      throw new Error(
        "Download fehlgeschlagen"
      );
    }

    const blob =
      await response.blob();

    const url =
      window.URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      `${activeTab}_results_${new Date()
        .toISOString()
        .slice(0,10)}.csv`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    window.URL.revokeObjectURL(url);

  } catch (error) {
    console.error(error);

    alert(
      "CSV konnte nicht heruntergeladen werden."
    );
  }
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
      
      {/* .csv loading */}
      {data && (
        <div className="flex justify-end mb-4">
          <TableExportButton
            onDownload={handleDownload}
          />
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
    </div>
  );
}