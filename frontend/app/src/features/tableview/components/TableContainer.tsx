// features/tableView/components/TableContainer.tsx
import { useParams } from "react-router-dom";

import { TableTabs } from "./TableTabs";
import { TableFilters } from "./TableFilters";
import { AnalysisTable } from "./AnalysisTable";

import { useTableState } from "../hooks/useTableState";
import { useTableData } from "../hooks/useTableData";
import {type DmpFilters, type DmrFilters, useTableFilters} from "../hooks/useTableFilters";
import HeatMap from "./heatmap/HeatMap.tsx";
import SkeletonTable from "./SkeletonTable.tsx";
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

  /*const handleApplyFilters = () => {
    applyFilters(activeTab);
    // Seite zurücksetzen auf 1 (Filter ändert Ergebnismenge)
    updatePage(activeTab, 1);
  };

  const handleResetFilters = () => {
    resetFilters(activeTab);
    updatePage(activeTab, 1);
  };*/

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

    const params = new URLSearchParams();

    if (currentSort.sort_by && currentSort.sort_order) {
      params.append("sort_by", currentSort.sort_by);
      params.append("sort_order", currentSort.sort_order);
    }

    // Build the filter params generically (single source of truth, same as the
    // table fetch) so the export always matches the on-screen filtered view and
    // no filter can be forgotten when a new one is added.
    const filters = appliedFilters[activeTab];
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "") {
        params.append(`filter_${key}`, value as string);
      }
    });

    try {
      const response = await fetch(
          `/api/v1/table/${job_id}/${activeTab}/export?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Download fehlgeschlagen");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${activeTab}_results_${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("CSV konnte nicht heruntergeladen werden.");
    }
  };


  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Tabs */}
      <TableTabs activeTab={activeTab} onChange={handleTabChange} />

      {/* Filter */}
      {/*<div className="mt-4">
        <TableFilters
          table={activeTab}
          filters={draftFilters[activeTab]}
          onChange={(field, value) => updateDraftFilter(activeTab, field, value)}
          onApply={handleApplyFilters}
          onReset={handleResetFilters}
        />
      </div>*/}
      {activeTab === "dmp" && (
          <TableFilters<DmpFilters>
              table="dmp"
              filters={draftFilters.dmp}
              onChange={(field, value) => updateDraftFilter("dmp", field, value)}
              onApply={() => {
                applyFilters("dmp");
                updatePage("dmp", 1);
              }}
              onReset={() => {
                resetFilters("dmp");
                updatePage("dmp", 1);
              }}
          />
      )}
      {activeTab === "dmr" && (
          <TableFilters<DmrFilters>
              table="dmr"
              filters={draftFilters.dmr}
              onChange={(field, value) => updateDraftFilter("dmr", field, value)}
              onApply={() => {
                applyFilters("dmr");
                updatePage("dmr", 1);
              }}
              onReset={() => {
                resetFilters("dmr");
                updatePage("dmr", 1);
              }}
          />
      )}



      {/* Filter-Status */}
      {hasFilters(activeTab) && (
        <div className="mt-2 text-sm text-primary">
          Gefiltert – {data?.pagination?.total_rows || 0} Einträge
        </div>
      )}

      {/* Loading */}
      {loading && (
        <SkeletonTable columns={6} rows={pageSize} />
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-danger-badgeBackground border border-danger rounded-md text-danger-badgeText">
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

      {/* HeatMap */}
      {activeTab === "dmp" && (
          <div className="w-full py-12 mt-3">
            <HeatMap filters={appliedFilters.dmp} rowCount={data?.pagination?.total_rows} />
          </div>
      )}
    </div>
  );
}