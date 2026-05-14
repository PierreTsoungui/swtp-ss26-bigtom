/**
 * AnalysisTable.test.tsx
 *
 * Unit tests for AnalysisTable component.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AnalysisTable from "../components/AnalysisTable";

describe("AnalysisTable", () => {
  const columns = ["A", "B", "C"];

  const rows = [
    { id: "1", concentration: 10, unit: "µg/L", date: "2025-01-01", status: "Abgeschlossen" },
    { id: "2", concentration: 20, unit: "µg/L", date: "2025-01-02", status: "Validiert" },
  ];

  it("renders all columns", () => {
    render(<AnalysisTable columns={columns} rows={rows as any} />);

    const headers = screen.getAllByRole("columnheader");

    expect(headers).toHaveLength(3);
    expect(headers[0]).toHaveTextContent("A");
    expect(headers[1]).toHaveTextContent("B");
    expect(headers[2]).toHaveTextContent("C");
  });

  it("renders all rows and key values", () => {
    render(<AnalysisTable columns={columns} rows={rows as any} />);

    const tableRows = screen.getAllByRole("row");

    // row[0] = header
    const dataRows = tableRows.slice(1);

    expect(dataRows).toHaveLength(2);

    // check first row content
    expect(dataRows[0]).toHaveTextContent("1");
    expect(dataRows[0]).toHaveTextContent("10");

    // check second row content
    expect(dataRows[1]).toHaveTextContent("2");
    expect(dataRows[1]).toHaveTextContent("20");
  });
});
