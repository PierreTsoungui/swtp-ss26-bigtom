 import { useParams } from "react-router-dom";

import { TableTabs } from "./TableTabs";
import { AnalysisTable } from "./AnalysisTable";

import { useTableState } from "../hooks/useTableState";
import { useTableData } from "../hooks/useTableData";

export function TableContainer() {
  const { job_id } = useParams();
  const { activeTab, setActiveTab, sorting, updateSorting } = useTableState();
  const currentSort = sorting[activeTab];
  const { data } = useTableData(
    job_id ?? null,
    activeTab,
    currentSort.sort_by,
    currentSort.sort_order
  );

  return (
    <div className="w-full max-w-5xl mx-auto">
      <TableTabs activeTab={activeTab} onChange={setActiveTab} />
      <AnalysisTable
        data={data}
        sorting={currentSort}
        onSort={(column) => updateSorting(activeTab, column)}
      />
    </div>
  );
}