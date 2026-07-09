import { useState } from "react";
import { useParams } from "react-router";

import { TableTabs } from "./TableTabs";
import { TableFilters } from "./TableFilters";
import { AnalysisTable } from "./AnalysisTable";

import { useTableState } from "../../hooks/useTableState";
import { useTableData } from "../../hooks/useTableData";
import { type DmpFilters, type DmrFilters, useTableFilters } from "../../hooks/useTableFilters";
import { exportTableCsv } from "../../hooks/exportTableCsv";
import HeatMap from "../heatmap/HeatMap.tsx";
import SkeletonTable from "./SkeletonTable.tsx";
import { TableExportButton } from "./TableExportButton";
import ErrorMessage from "@shared/errors/ErrorMessage";
import { logger } from "@shared/utils/logger.ts";

/**
 * Central orchestrator for the results view, managing the lifecycle of data tables and exports.
 *
 * Responsibilities:
 * - Coordinates state between {@link TableTabs}, {@link TableFilters}, and the {@link AnalysisTable}.
 * - Synchronizes active filters, server-side sorting, and pagination logic.
 * - Handles high-level data actions such as CSV exporting and heatmap integration.
 *
 * @remarks
 * This component acts as the "Single Source of Truth" for the analysis results UI,
 * ensuring that filters applied to the table are correctly forwarded to both
 * the export utility and the {@link HeatMap} component.
 */
export function TableContainer() {
  const { job_id } = useParams();

  /** Independent UI state for sorting, pagination, and active tab. */
  const { activeTab, setActiveTab, sorting, updateSorting, pagination, updatePage } =
    useTableState();

  const currentSort = sorting[activeTab];
  const currentPage = pagination[activeTab].page;
  const pageSize = pagination[activeTab].pageSize;

  /** Management of draft (user input) vs. applied filter states. */
  const {
    draftFilters,
    appliedFilters,
    updateDraftFilter,
    applyFilters,
    resetFilters,
    hasFilters,
  } = useTableFilters();

  /** User-facing message shown in the shared snackbar when a CSV export fails. */
  const [downloadError, setDownloadError] = useState<string | null>(null);

  /** Main data fetching hook, triggered by jobId, sorting, filtering, or pagination changes. */
  const { data, loading, error } = useTableData(
    job_id ?? null,
    activeTab,
    currentSort.sort_by,
    currentSort.sort_order,
    appliedFilters[activeTab],
    currentPage,
    pageSize,
  );

  /** Switches the active analysis context (DMP or DMR). */
  const handleTabChange = (tab: "dmp" | "dmr") => {
    setActiveTab(tab);
  };

  /** Triggers server-side sorting for the current table. */
  const handleSort = (column: string) => {
    updateSorting(activeTab, column);
  };

  /** Updates the pagination state and triggers a new data fetch. */
  const handlePageChange = (newPage: number) => {
    updatePage(activeTab, newPage);
  };

  /**
   * Generates and downloads a CSV export of the currently filtered and sorted view.
   * Uses a generic parameter mapping to ensure consistency with the on-screen table.
   */
  const handleDownload = async () => {
    if (!job_id) return;

    const params = new URLSearchParams();

    if (currentSort.sort_by && currentSort.sort_order) {
      params.append("sort_by", currentSort.sort_by);
      params.append("sort_order", currentSort.sort_order);
    }

    const filters = appliedFilters[activeTab];
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "") {
        params.append(`filter_${key}`, value);
      }
    });

    try {
      await exportTableCsv(job_id, activeTab, params);
    } catch (error) {
      logger.error("CSV export failed", error);
      setDownloadError("The CSV could not be downloaded. Please try again.");
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Transient CSV-export failure, surfaced via the shared snackbar. */}
      <ErrorMessage
        open={downloadError !== null}
        error={downloadError}
        vertical="top"
        horizontal="center"
        onClose={() => setDownloadError(null)}
      />

      {/* Tabs */}
      <TableTabs activeTab={activeTab} onChange={handleTabChange} />

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

      {/* Filter status */}
      {hasFilters(activeTab) && (
        <div className="mt-2 text-sm text-primary">
          Filtered – {data?.pagination?.total_rows || 0} Entries
        </div>
      )}

      {/* Loading */}
      {loading && <SkeletonTable columns={6} rows={pageSize} />}

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-danger-badgeBackground border border-danger rounded-md text-danger-badgeText">
          Error: {error}
        </div>
      )}

      {/* .csv loading */}
      {data && (
        <div className="flex justify-end mb-4">
          <TableExportButton onDownload={() => void handleDownload()} />
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
