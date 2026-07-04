import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import FilterPanel from "./FilterPanel";
import { DEFAULT_FILTER_SETTINGS } from "../utils/types";

// Flatten and mock all individual child filter inputs to isolate the container handler methods cleanly
vi.mock("./DetPValueFilter.tsx", () => ({
  DetPValueFilter: ({ onChange }: any) => <button data-testid="trigger-det-p" onClick={() => onChange({ enabled: true, cutoff: 0.05 })} />
}));
vi.mock("./BeadCountFilter.tsx", () => ({
  BeadCountFilter: ({ onChange }: any) => <button data-testid="trigger-bead-count" onClick={() => onChange({ enabled: true, bead_cutoff: 3 })} />
}));
vi.mock("./NonCpgFilter.tsx", () => ({
  default: ({ onChange }: any) => <button data-testid="trigger-non-cpg" onClick={() => onChange({ enabled: true })} />
}));
vi.mock("./SnpFilter.tsx", () => ({
  default: ({ onChange }: any) => <button data-testid="trigger-snp" onClick={() => onChange({ enabled: true, maf_cutoff: 0.01 })} />
}));
vi.mock("./MultiHitFilter.tsx", () => ({
  default: ({ onChange }: any) => <button data-testid="trigger-multi-hit" onClick={() => onChange({ enabled: true })} />
}));
vi.mock("./XYChromosomesFilter.tsx", () => ({
  default: ({ onChange }: any) => <button data-testid="trigger-xy" onClick={() => onChange({ enabled: true })} />
}));
vi.mock("./SampleQuality.tsx", () => ({
  SampleQuality: ({ onChange }: any) => <button data-testid="trigger-quality" onClick={() => onChange({ enabled: true, detection_p_cutoff: 0.05 })} />
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
      />
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
      />
    );

    // Act - Locate and trigger the stopPropagation reset button layout
    const resetButton = screen.getByRole("button", { name: "Reset to default settings" });
    fireEvent.click(resetButton);

    // Assert reset payload flushes back to state layers
    expect(onFilterSettingsChangeMock).toHaveBeenCalledTimes(1);
    expect(onFilterSettingsChangeMock).toHaveBeenCalledWith(structuredClone(DEFAULT_FILTER_SETTINGS));
  });

  // NEW SYSTEM TESTS

  it("safely captures data adjustments across all seven internal filter step method channels", () => {
    // Arrange
    const initialSettings = structuredClone(DEFAULT_FILTER_SETTINGS);
    render(<FilterPanel filterSettings={initialSettings} onFilterSettingsChange={onFilterSettingsChangeMock} />);

    // 1. Validate DetPValue handler mapping channel
    fireEvent.click(screen.getByTestId("trigger-det-p"));
    expect(onFilterSettingsChangeMock).toHaveBeenLastCalledWith(expect.objectContaining({
      filter_settings: expect.objectContaining({ det_p: { enabled: true, cutoff: 0.05 } })
    }));

    // 2. Validate BeadCount handler mapping channel
    fireEvent.click(screen.getByTestId("trigger-bead-count"));
    expect(onFilterSettingsChangeMock).toHaveBeenLastCalledWith(expect.objectContaining({
      filter_settings: expect.objectContaining({ bead_count: { enabled: true, bead_cutoff: 3 } })
    }));

    // 3. Validate NonCpG handler mapping channel
    fireEvent.click(screen.getByTestId("trigger-non-cpg"));
    expect(onFilterSettingsChangeMock).toHaveBeenLastCalledWith(expect.objectContaining({
      filter_settings: expect.objectContaining({ non_cpg: { enabled: true } })
    }));

    // 4. Validate SNP handler mapping channel
    fireEvent.click(screen.getByTestId("trigger-snp"));
    expect(onFilterSettingsChangeMock).toHaveBeenLastCalledWith(expect.objectContaining({
      filter_settings: expect.objectContaining({ snp: { enabled: true, maf_cutoff: 0.01 } })
    }));

    // 5. Validate MultiHit handler mapping channel
    fireEvent.click(screen.getByTestId("trigger-multi-hit"));
    expect(onFilterSettingsChangeMock).toHaveBeenLastCalledWith(expect.objectContaining({
      filter_settings: expect.objectContaining({ multi_hit: { enabled: true } })
    }));

    // 6. Validate XYChromosomes handler mapping channel
    fireEvent.click(screen.getByTestId("trigger-xy"));
    expect(onFilterSettingsChangeMock).toHaveBeenLastCalledWith(expect.objectContaining({
      filter_settings: expect.objectContaining({ xy_chromosomes: { enabled: true } })
    }));

    // 7. Validate SampleQuality handler mapping channel
    fireEvent.click(screen.getByTestId("trigger-quality"));
    expect(onFilterSettingsChangeMock).toHaveBeenLastCalledWith(expect.objectContaining({
      filter_settings: expect.objectContaining({ sample_quality: { enabled: true, detection_p_cutoff: 0.05 } })
    }));
  });
});
