 import { useParams } from "react-router-dom";

import { TableTabs } from "./TableTabs";
import { AnalysisTable } from "./AnalysisTable";

import { useTableState } from "../hooks/useTableState";
import { useTableData } from "../hooks/useTableData";

export function TableContainer() {
  const { job_id } = useParams();

  const {
    activeTab,
    setActiveTab,
  } = useTableState();

  const {
    data,
    loading,
  } = useTableData(
    job_id ?? null,
    activeTab
  );

  return (
    <div className="w-full max-w-7xl mx-auto">
      <TableTabs
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {loading ? (
        <p>Lade Tabelle...</p>
      ) : (
        <AnalysisTable data={data} />
      )}
    </div>
  );
}