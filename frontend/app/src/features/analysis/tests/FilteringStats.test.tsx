/*import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilteringStats } from "../components/FilteringStats";
import type { FilteringStatsType as FilteringStatsData } from "../utils/types";


describe("FilteringStats", () => {
  it("rendert alle Filterschritte korrekt", () => {
    const stats: FilteringStatsData = {
      steps: [
        {
          name: "Qualitätsfilter",
          probesBefore: 500000,
          removed: 12000,
          probesAfter: 488000,
        },
        {
          name: "Sample-Fehler",
          probesBefore: 488000,
          removed: 3000,
          probesAfter: 485000,
        },
      ],
      finalProbeCount: 485000,
    };

    render(<FilteringStats stats={stats} />);

    expect(screen.getByRole("columnheader", { name: "Filterschritt" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Sonden vorher" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Entfernt" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Sonden nachher" })).toBeInTheDocument();

    expect(screen.getByRole("rowheader", { name: "Qualitätsfilter" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Sample-Fehler" })).toBeInTheDocument();
    expect(screen.getByText("500.000")).toBeInTheDocument();
    expect(screen.getAllByText("488.000")).toHaveLength(2);
    expect(screen.getAllByText("485.000")).toHaveLength(2);
    expect(screen.getByText("12.000")).toBeInTheDocument();
    expect(screen.getByText("3.000")).toBeInTheDocument();
    expect(screen.getByLabelText("Finale Sondenanzahl 485.000")).toBeInTheDocument();
  });

  it("fängt leere oder fehlerhafte Statistikdaten ab", () => {
    const malformedStats = {
      steps: [],
      finalProbeCount: Number.NaN,
    } as unknown as FilteringStatsData;

    expect(() => render(<FilteringStats stats={malformedStats} />)).not.toThrow();
    expect(screen.getByText("Filterstatistik nicht verfügbar")).toBeInTheDocument();
    expect(
      screen.getByText("Die empfangenen Statistikdaten sind leer oder fehlerhaft.")
    ).toBeInTheDocument();
  });
});
 */
