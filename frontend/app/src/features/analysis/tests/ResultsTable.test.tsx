import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultsTable } from "../components/ResultsTable";
import type { ResultsTableResponse } from "../utils/types";

const tableData: ResultsTableResponse = {
  columns: ["CpG", "Chromosome", "BetaValue"],
  rows: [
    {
      CpG: "cg000001",
      Chromosome: "chr1",
      BetaValue: 0.82,
    },
    {
      CpG: "cg000002",
      Chromosome: "chr2",
      BetaValue: null,
    },
  ],
  page: 1,
  page_size: 100,
  total_rows: 2,
};

describe("ResultsTable", () => {
  it("rendert dynamische Spalten korrekt", () => {
    render(
      <ResultsTable
        data={tableData}
        sorting={null}
        onSortingChange={vi.fn()}
      />
    );

    expect(screen.getByRole("columnheader", { name: /CpG/ })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /Chromosome/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /BetaValue/ })
    ).toBeInTheDocument();
  });

  it("rendert Datenzeilen korrekt", () => {
    render(
      <ResultsTable
        data={tableData}
        sorting={null}
        onSortingChange={vi.fn()}
      />
    );

    expect(screen.getByText("cg000001")).toBeInTheDocument();
    expect(screen.getByText("chr1")).toBeInTheDocument();
    expect(screen.getByText("0,82")).toBeInTheDocument();
    expect(screen.getByText("cg000002")).toBeInTheDocument();
    expect(screen.getByText("chr2")).toBeInTheDocument();
    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("Klick auf Tabellenkopf loest Sortierung aus", () => {
    const onSortingChange = vi.fn();

    render(
      <ResultsTable
        data={tableData}
        sorting={null}
        onSortingChange={onSortingChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /BetaValue/ }));

    expect(onSortingChange).toHaveBeenCalledWith({
      column: "BetaValue",
      order: "asc",
    });
  });
});
