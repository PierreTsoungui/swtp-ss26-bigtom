import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FilterPanel from "./FilterPanel";
import { DEFAULT_FILTER_SETTINGS } from "../utils/types";

describe("FilterPanel HelpButton", () => {
  it("renders the filtering help next to the filter settings", () => {
    render(
      <FilterPanel
        filterSettings={structuredClone(DEFAULT_FILTER_SETTINGS)}
        onFilterSettingsChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Quality Filtering" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hilfe zur Filterung öffnen" }));

    expect(screen.getByText(/Why is filtering necessary/i)).toBeInTheDocument();
    expect(screen.getByText(/automated PCA-based outlier detection/i)).toBeInTheDocument();
  });
});
