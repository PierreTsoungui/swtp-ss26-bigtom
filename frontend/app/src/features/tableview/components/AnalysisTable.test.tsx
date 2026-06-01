import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { AnalysisTable } from "./AnalysisTable";

const mockData = {
  table: "dmp",

  table_title: "DMP Results",

  description: "Differentially Methylated Positions",

  columns: [
    {
      key: "CpG",
      label: "CpG",
      type: "string",
      sortable: true,
      filterable: true,
    },
    {
      key: "logFC",
      label: "logFC",
      type: "float",
      sortable: true,
      filterable: true,
    },
    {
      key: "adj_p",
      label: "Adjusted P",
      type: "float",
      sortable: true,
      filterable: true,
    },
  ],

  data: [
    {
      CpG: "cg000001",
      logFC: 1.24,
      adj_p: 0.001,
    },
    {
      CpG: "cg000002",
      logFC: -0.87,
      adj_p: 0.012,
    },
  ],

  pagination: {
    page: 1,
    page_size: 50,
    total_rows: 2,
    total_pages: 1,
  },
};

describe("AnalysisTable", () => {
  it("renders column headers", () => {
    render(<AnalysisTable data={mockData} />);

    expect(
      screen.getByText("CpG")
    ).toBeInTheDocument();

    expect(
      screen.getByText("logFC")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Adjusted P")
    ).toBeInTheDocument();
  });

  it("renders table data", () => {
    render(<AnalysisTable data={mockData} />);

    expect(
      screen.getByText("cg000001")
    ).toBeInTheDocument();

    expect(
      screen.getByText("cg000002")
    ).toBeInTheDocument();
  });

  it("renders all rows", () => {
    render(<AnalysisTable data={mockData} />);

    /**
     * Header + 2 Datenzeilen
     */
    expect(
      screen.getAllByRole("row")
    ).toHaveLength(3);
  });

  it("shows empty state when no data is available", () => {
    render(<AnalysisTable data={null} />);

    expect(
      screen.getByText("Keine Daten vorhanden.")
    ).toBeInTheDocument();
  });
});