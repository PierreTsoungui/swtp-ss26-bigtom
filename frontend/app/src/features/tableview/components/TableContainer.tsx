// features/tableView/components/TableContainer.tsx
import { useParams } from "react-router-dom";

import { TableTabs } from "./TableTabs";
import { TableFilters } from "./TableFilters";
import { AnalysisTable } from "./AnalysisTable";

import { useTableState } from "../hooks/useTableState";
import { useTableData } from "../hooks/useTableData";
import { useTableFilters } from "../hooks/useTableFilters";
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

    const params = new URLSearchParams();

    if (currentSort.sort_by && currentSort.sort_order) {
      params.append("sort_by", currentSort.sort_by);
      params.append("sort_order", currentSort.sort_order);
    }

    const filters = appliedFilters[activeTab];

    // DMP & DMR gemeinsame Filter
    if ((filters as any).chr) {
      params.append("filter_chr", (filters as any).chr);
    }
    if ((filters as any).start) {
      params.append("filter_start", (filters as any).start);
    }
    if ((filters as any).stop) {
      params.append("filter_stop", (filters as any).stop);
    }

    // DMR-spezifische Filter
    if ((filters as any).dmrid) {
      params.append("filter_dmrid", (filters as any).dmrid);
    }
    if ((filters as any).p_value) {
      params.append("filter_p_value", (filters as any).p_value);
    }

    // DMP-spezifische Filter
    if ((filters as any).adj_p_value) {
      params.append("filter_adj_p_value", (filters as any).adj_p_value);
    }
    if ((filters as any).gene) {
      params.append("filter_gene", (filters as any).gene);
    }
    if ((filters as any).delta_beta) {
      params.append("filter_delta_beta", (filters as any).delta_beta);
    }
    if ((filters as any).sample_group) {
      params.append("filter_sample_group", (filters as any).sample_group);
    }
    if ((filters as any).group1_avg_min) {
      params.append("filter_group1_avg_min", (filters as any).group1_avg_min);
    }
    if ((filters as any).group1_avg_max) {
      params.append("filter_group1_avg_max", (filters as any).group1_avg_max);
    }
    if ((filters as any).group2_avg_min) {
      params.append("filter_group2_avg_min", (filters as any).group2_avg_min);
    }
    if ((filters as any).group2_avg_max) {
      params.append("filter_group2_avg_max", (filters as any).group2_avg_max);
    }
    if ((filters as any).log_fc_min) {
      params.append("filter_log_fc_min", (filters as any).log_fc_min);
    }
    if ((filters as any).log_fc_max) {
      params.append("filter_log_fc_max", (filters as any).log_fc_max);
    }

    // DMR-spezifische Filter
    if ((filters as any).mean_diff_min) {
      params.append("filter_mean_diff_min", (filters as any).mean_diff_min);
    }
    if ((filters as any).mean_diff_max) {
      params.append("filter_mean_diff_max", (filters as any).mean_diff_max);
    }
    if ((filters as any).width_min) {
      params.append("filter_width_min", (filters as any).width_min);
    }
    if ((filters as any).width_max) {
      params.append("filter_width_max", (filters as any).width_max);
    }
    if ((filters as any).n_dmps_min) {
      params.append("filter_n_dmps_min", (filters as any).n_dmps_min);
    }
    if ((filters as any).n_dmps_max) {
      params.append("filter_n_dmps_max", (filters as any).n_dmps_max);
    }

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
        <SkeletonTable columns={6} rows={pageSize} />
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

      {/* HeatMap */}
      {activeTab === "dmp" && (
          <div className="flex justify-center py-12 mt-3">
            <HeatMap />
          </div>
      )}
    </div>
  );
}