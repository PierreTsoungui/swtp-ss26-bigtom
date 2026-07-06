import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import FilterPanel from "./FilterPanel";
import {
  DEFAULT_FILTER_SETTINGS,
  type FilterSettings,
  type BeadCountFilterType,
  type DetPFilterType,
  type MultiHitFilterType,
  type NonCpgFilterType,
  type SampleQualityFilterType,
  type SnpFilterType,
  type XYChromosomesFilterType,
} from "../types";

// Flatten and mock all individual child filter inputs to isolate the container handler methods cleanly
vi.mock("./filters/DetPValueFilter.tsx", () => ({
  DetPValueFilter: ({ onChange }: { onChange: (v: DetPFilterType) => void }) => (
    <button data-testid="trigger-det-p" onClick={() => onChange({ enabled: true, cutoff: 0.05 })} />
  ),
}));
vi.mock("./filters/BeadCountFilter.tsx", () => ({
  BeadCountFilter: ({ onChange }: { onChange: (v: BeadCountFilterType) => void }) => (
    <button
      data-testid="trigger-bead-count"
      onClick={() => onChange({ enabled: true, bead_cutoff: 3 })}
    />
  ),
}));
vi.mock("./filters/NonCpgFilter.tsx", () => ({
  default: ({ onChange }: { onChange: (v: NonCpgFilterType) => void }) => (
    <button data-testid="trigger-non-cpg" onClick={() => onChange({ enabled: true })} />
  ),
}));
vi.mock("./filters/SnpFilter.tsx", () => ({
  default: ({ onChange }: { onChange: (v: SnpFilterType) => void }) => (
    <button
      data-testid="trigger-snp"
      onClick={() => onChange({ enabled: true, maf_cutoff: 0.01 })}
    />
  ),
}));
vi.mock("./filters/MultiHitFilter.tsx", () => ({
  default: ({ onChange }: { onChange: (v: MultiHitFilterType) => void }) => (
    <button data-testid="trigger-multi-hit" onClick={() => onChange({ enabled: true })} />
  ),
}));
vi.mock("./filters/XYChromosomesFilter.tsx", () => ({
  default: ({ onChange }: { onChange: (v: XYChromosomesFilterType) => void }) => (
    <button data-testid="trigger-xy" onClick={() => onChange({ enabled: true })} />
  ),
}));
vi.mock("./filters/SampleQuality.tsx", () => ({
  SampleQuality: ({ onChange }: { onChange: (v: SampleQualityFilterType) => void }) => (
    <button
      data-testid="trigger-quality"
      onClick={() =>
        onChange({ enabled: true, detection_p_cutoff: 0.05 } as SampleQualityFilterType)
      }
    />
  ),
}));

describe("FilterPanel Component", () => {
  const onFilterSettingsChangeMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the filtering help block button and opens dynamic markdown documentation", () => {
    // Arrange & Act
    render(
      <FilterPanel
        filterSettings={structuredClone(DEFAULT_FILTER_SETTINGS)}
        onFilterSettingsChange={onFilterSettingsChangeMock}
      />,
    );

    expect(screen.getByRole("heading", { name: "Quality Filtering" })).toBeInTheDocument();

    // Act - Click help trigger using the updated English descriptor
    const helpButton = screen.getByRole("button", { name: "Open filtering help" });
    fireEvent.click(helpButton);

    // Assert markdown contents load
    expect(screen.getByText(/Why is filtering necessary/i)).toBeInTheDocument();
    expect(screen.getByText(/automated PCA-based outlier detection/i)).toBeInTheDocument();
  });

  it("triggers parent updates with the default settings payload when clicking the reset action icon button", () => {
    // Arrange
    render(
      <FilterPanel
        filterSettings={structuredClone(DEFAULT_FILTER_SETTINGS)}
        onFilterSettingsChange={onFilterSettingsChangeMock}
      />,
    );

    // Act - Locate and trigger the stopPropagation reset button layout
    const resetButton = screen.getByRole("button", { name: "Reset to default settings" });
    fireEvent.click(resetButton);

    // Assert reset payload flushes back to state layers
    expect(onFilterSettingsChangeMock).toHaveBeenCalledTimes(1);
    expect(onFilterSettingsChangeMock).toHaveBeenCalledWith(
      structuredClone(DEFAULT_FILTER_SETTINGS),
    );
  });

  // NEW SYSTEM TESTS

  it("safely captures data adjustments across all seven internal filter step method channels", () => {
    // Arrange
    const initialSettings = structuredClone(DEFAULT_FILTER_SETTINGS);
    render(
      <FilterPanel
        filterSettings={initialSettings}
        onFilterSettingsChange={onFilterSettingsChangeMock}
      />,
    );

    /** The inner filter_settings from the most recent onChange callback. */
    const lastFilters = () =>
      (onFilterSettingsChangeMock.mock.lastCall?.[0] as FilterSettings).filter_settings;

    // Each child's onChange is routed into the matching filter_settings slot.
    fireEvent.click(screen.getByTestId("trigger-det-p"));
    expect(lastFilters().det_p).toEqual({ enabled: true, cutoff: 0.05 });

    fireEvent.click(screen.getByTestId("trigger-bead-count"));
    expect(lastFilters().bead_count).toEqual({ enabled: true, bead_cutoff: 3 });

    fireEvent.click(screen.getByTestId("trigger-non-cpg"));
    expect(lastFilters().non_cpg).toEqual({ enabled: true });

    fireEvent.click(screen.getByTestId("trigger-snp"));
    expect(lastFilters().snp).toEqual({ enabled: true, maf_cutoff: 0.01 });

    fireEvent.click(screen.getByTestId("trigger-multi-hit"));
    expect(lastFilters().multi_hit).toEqual({ enabled: true });

    fireEvent.click(screen.getByTestId("trigger-xy"));
    expect(lastFilters().xy_chromosomes).toEqual({ enabled: true });

    fireEvent.click(screen.getByTestId("trigger-quality"));
    expect(lastFilters().sample_quality).toEqual({ enabled: true, detection_p_cutoff: 0.05 });
  });
});
