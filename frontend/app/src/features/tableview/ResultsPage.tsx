import {TableContainer} from "./components/TableContainer.tsx";
import HelpButton from "../analysis/components/HelpButton.tsx";
import { helpTexts } from "../../shared/utils/help/helpTexts.ts";

export function ResultsPage() {
  return (
    <main className="p-6">
      <div className="mx-auto mb-4 flex w-full max-w-7xl items-center gap-2">
        <h1 className="text-2xl font-semibold">Table View &amp; Data Export</h1>
        <HelpButton
          helpText={helpTexts.tableExport}
          ariaLabel="Hilfe zur Ergebnistabelle und zum CSV-Export öffnen"
          dialogTitle="Exporting Results"
        />
      </div>
      <TableContainer />
    </main>
  );
}
