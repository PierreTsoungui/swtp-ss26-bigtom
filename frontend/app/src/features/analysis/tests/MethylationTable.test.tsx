import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MethylationResultsTable from "../components/MethylationTable";
import type { MethylationRow } from "../mocks/methylationMock";

const mockRows: MethylationRow[] = [
  {
    cpgId: "cg12345678",
    geneSymbol: "NFIX",
    deltaBeta: 0.47,
    pValue: 0.0000023,
    region: "Körper",
    status: "signifikant",
    chromosome: "19",
    position: 17452345,
  },
  {
    cpgId: "cg87654321",
    geneSymbol: "BDNF",
    deltaBeta: -0.32,
    pValue: 0.000000012,
    region: "Promotor",
    status: "signifikant",
    chromosome: "11",
    position: 27658364,
  },
];

describe("MethylationResultsTable", () => {
  it("rendert die Tabelle mit den richtigen Spalten", () => {
    render(<MethylationResultsTable rows={mockRows} />);

    expect(screen.getByText("CpG ID")).toBeInTheDocument();
    expect(screen.getByText("Gen Symbol")).toBeInTheDocument();
    expect(screen.getByText("Δβ")).toBeInTheDocument();
    expect(screen.getByText("p-Wert")).toBeInTheDocument();
    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("zeigt die richtige Anzahl von Zeilen an", () => {
    render(<MethylationResultsTable rows={mockRows} rowsPerPage={10} />);

    expect(screen.getByText("cg12345678")).toBeInTheDocument();
    expect(screen.getByText("cg87654321")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(mockRows.length + 1); // +1 für header
  });

  it("zeigt die Pagination-Informationen korrekt an", () => {
    render(<MethylationResultsTable rows={mockRows} rowsPerPage={1} />);

    expect(screen.getByText(/Anzeige 1–1 von 2/)).toBeInTheDocument();
    expect(screen.getByText("Nächste →")).toBeInTheDocument();
  });

  it("navigiert zwischen Seiten mit Pagination", () => {
    render(<MethylationResultsTable rows={mockRows} rowsPerPage={1} />);

    expect(screen.getByText("cg12345678")).toBeInTheDocument();

    const nextButton = screen.getByText("Nächste →");
    fireEvent.click(nextButton);

    expect(screen.getByText("cg87654321")).toBeInTheDocument();
  });

  it("ruft onRowClick auf wenn eine Zeile geklickt wird", () => {
    const handleRowClick = vi.fn();
    render(<MethylationResultsTable rows={mockRows} onRowClick={handleRowClick} />);

    const firstRow = screen.getByText("cg12345678").closest("tr");
    fireEvent.click(firstRow!);

    expect(handleRowClick).toHaveBeenCalledWith(mockRows[0]);
  });

  it("rendert 100 Zeilen ohne Performance-Probleme", () => {
    const hundredRows = Array.from({ length: 100 }, (_, i) => ({
      ...mockRows[0],
      cpgId: `cg${i}`,
    }));

    const startTime = performance.now();
    render(<MethylationResultsTable rows={hundredRows} />);
    const endTime = performance.now();

    // Le rendu devrait prendre moins de 100ms
    expect(endTime - startTime).toBeLessThan(100);
  });
});
