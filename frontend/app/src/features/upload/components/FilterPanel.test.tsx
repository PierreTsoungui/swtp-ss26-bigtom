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

  it("keeps reset outside the accordion trigger and does not toggle the accordion", () => {
    const onFilterSettingsChange = vi.fn();

    render(
      <FilterPanel
        filterSettings={structuredClone(DEFAULT_FILTER_SETTINGS)}
        onFilterSettingsChange={onFilterSettingsChange}
      />,
    );

    const accordionTrigger = screen.getByRole("button", {
      name: /customize filter settings/i,
    });
    const resetButton = screen.getByRole("button", {
      name: "Filtereinstellungen zurücksetzen",
    });

    expect(accordionTrigger).toHaveAttribute("aria-expanded", "false");
    expect(accordionTrigger).not.toContainElement(resetButton);

    fireEvent.click(resetButton);

    expect(onFilterSettingsChange).toHaveBeenCalledTimes(1);
    expect(accordionTrigger).toHaveAttribute("aria-expanded", "false");
  });
});
