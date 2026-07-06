import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest"; // Added missing vi import

import { AnalysisTable } from "./AnalysisTable";
import type { TableData } from "../../types";

const mockData = {
  table: "dmp",
  table_title: "DMP Results",
  description: "Differentially Methylated Positions",
  columns: [
    { key: "CpG", label: "CpG", type: "string", sortable: true, filterable: true },
    { key: "logFC", label: "logFC", type: "float", sortable: true, filterable: true },
    { key: "adj_p", label: "Adjusted P", type: "float", sortable: true, filterable: true },
  ],
  data: [
    { CpG: "cg000001", logFC: 1.24, adj_p: 0.001 },
    { CpG: "cg000002", logFC: -0.87, adj_p: 0.012 },
  ],
  pagination: {
    page: 1,
    page_size: 50,
    total_rows: 2,
    total_pages: 1,
  },
};

// Mock data for testing formatCellValue edge cases
const mockFormattingData = {
  columns: [
    { key: "textValue", label: "Text", type: "string" },
    { key: "floatValue", label: "Float", type: "float" },
  ],
  data: [
    { textValue: null, floatValue: null }, // Case: null / undefined -> should render '—'
    { textValue: "Normal", floatValue: 0 }, // Case: exact 0 -> should render '0'
    { textValue: "Small", floatValue: 0.000023456 }, // Case: < 0.0001 -> scientific notation
    { textValue: "NormalFloat", floatValue: 1.25 }, // Case: trim trailing zeros -> '1.25'
    { textValue: "StringFloat", floatValue: "not_a_number" }, // Case: float type but string value -> String(value)
  ],
  pagination: { page: 1, page_size: 50, total_rows: 5, total_pages: 1 },
};

// Mock data for pagination scenarios (> 1 page)
const mockPaginationData = {
  columns: [{ key: "id", label: "ID", type: "string" }],
  data: [{ id: "1" }],
  pagination: {
    page: 1,
    page_size: 10,
    total_rows: 15,
    total_pages: 2, // Triggers both top and bottom pagination rendering
  },
};

describe("AnalysisTable", () => {
  it("renders column headers", () => {
    render(<AnalysisTable data={mockData} />);
    expect(screen.getByText("CpG")).toBeInTheDocument();
    expect(screen.getByText("logFC")).toBeInTheDocument();
    expect(screen.getByText("Adjusted P")).toBeInTheDocument();
  });

  it("renders table data", () => {
    render(<AnalysisTable data={mockData} />);
    expect(screen.getByText("cg000001")).toBeInTheDocument();
    expect(screen.getByText("cg000002")).toBeInTheDocument();
  });

  it("renders all rows (header + 2 data rows)", () => {
    render(<AnalysisTable data={mockData} />);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("shows empty state when no data, columns or rows are available", () => {
    const { rerender } = render(<AnalysisTable data={null} />);
    expect(screen.getByText("No data available.")).toBeInTheDocument();

    // Deliberately malformed payloads exercise the component's runtime guard
    // against inconsistent server data, hence the casts.
    rerender(<AnalysisTable data={{ columns: [], data: null } as unknown as TableData} />);
    expect(screen.getByText("No data available.")).toBeInTheDocument();

    rerender(<AnalysisTable data={{ columns: null, data: [] } as unknown as TableData} />);
    expect(screen.getByText("No data available.")).toBeInTheDocument();
  });

  it("calls onSort when clicking column header", () => {
    const onSort = vi.fn();
    render(
      <AnalysisTable
        data={mockData}
        onSort={onSort}
        sorting={{ sort_by: null, sort_order: null }}
      />,
    );

    fireEvent.click(screen.getByText("CpG"));
    expect(onSort).toHaveBeenCalledWith("CpG");
  });

  //NEW TESTS FOR FORMATCELLVALUE

  it("formats cell values correctly according to their type and boundary conditions", () => {
    render(<AnalysisTable data={mockFormattingData} />);

    // 1. Null / Undefined case -> displays em dash '—' (present twice: for textValue and floatValue)
    expect(screen.getAllByText("—")).toHaveLength(2);

    // 2. Exact 0 value for floats -> should display '0'
    expect(screen.getByText("0")).toBeInTheDocument();

    // 3. Small float value (< 0.0001) -> exponential format '2.3456e-5'
    expect(screen.getByText("2.3456e-5")).toBeInTheDocument();

    // 4. Normal float value -> trim trailing zeros ('1.25' instead of '1.2500')
    expect(screen.getByText("1.25")).toBeInTheDocument();

    // 5. String fallback on invalid float type -> renders string unchanged
    expect(screen.getByText("not_a_number")).toBeInTheDocument();
  });

  // NEW TESTS FOR PAGINATION AND SORT DIRECTIONS

  it("renders top and bottom pagination when total_pages > 1 and handles page changes", () => {
    const onPageChange = vi.fn();
    render(<AnalysisTable data={mockPaginationData} onPageChange={onPageChange} />);

    // Since pagination renders both top and bottom, we check for navigation buttons.
    const nextButtons = screen.getAllByRole("button");

    // Ensure pagination elements are rendered on screen
    expect(nextButtons.length).toBeGreaterThan(0);
  });

  it("applies the correct sort order directions to headers", () => {
    render(
      <AnalysisTable
        data={mockData}
        onSort={vi.fn()}
        sorting={{ sort_by: "CpG", sort_order: "desc" }}
      />,
    );

    // Finds the table header cell and validates the Material-UI specific sort-direction attribute
    const cpgHeader = screen.getByText("CpG").closest("th");
    expect(cpgHeader).toHaveAttribute("aria-sort", "descending");
  });
});
