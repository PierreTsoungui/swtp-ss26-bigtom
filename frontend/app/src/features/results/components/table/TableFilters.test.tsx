import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TableFilters } from "./TableFilters";

// Default empty filters for DMP mode
const defaultDmpFilters = {
  chr: "",
  start: "",
  stop: "",
  gene: "",
  feature: "",
  cgi: "",
  adj_p_value: "",
  delta_beta: "",
  delta_direction: "",
  group1_avg_min: "",
  group1_avg_max: "",
  group2_avg_min: "",
  group2_avg_max: "",
  log_fc_min: "",
  log_fc_max: "",
  dmr_id: "",
};

// Default empty filters for DMR mode
const defaultDmrFilters = {
  chr: "",
  dmrid: "",
  start: "",
  stop: "",
  p_value: "",
  mean_diff_min: "",
  mean_diff_max: "",
  width_min: "",
  width_max: "",
  n_dmps_min: "",
  n_dmps_max: "",
};

describe("TableFilters", () => {
  it("toggles the visibility of the filter panel on click", () => {
    render(
      <TableFilters
        table="dmp"
        filters={defaultDmpFilters}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    // Filter panel should be hidden initially
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    // Click the main toggle button
    const toggleButton = screen.getByRole("button", { name: /filter/i });
    fireEvent.click(toggleButton);

    // Filter panel inputs should now be visible
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);

    // Click again to close
    fireEvent.click(toggleButton);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders correct filter definitions based on 'dmp' table type", () => {
    render(
      <TableFilters
        table="dmp"
        filters={defaultDmpFilters}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    // Open filter panel
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));

    // Check specific DMP inputs are rendered via placeholders or text
    expect(screen.getByPlaceholderText("Gene (contains)")).toBeInTheDocument();
    expect(screen.getByText("CpG context")).toBeInTheDocument();
  });

  it("renders correct filter definitions based on 'dmr' table type", () => {
    render(
      <TableFilters
        table="dmr"
        filters={defaultDmrFilters}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    // Open filter panel
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));

    // Check specific DMR inputs
    expect(screen.getByPlaceholderText("Mean Diff (abs Min)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("N-DMPs (Min)")).toBeInTheDocument();
  });

  it("displays the correct count badge and header reset button when filters are active", () => {
    const activeFilters = {
      ...defaultDmpFilters,
      chr: "chr1",
      gene: "BRCA1",
    };

    const onResetMock = vi.fn();

    render(
      <TableFilters
        table="dmp"
        filters={activeFilters}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onReset={onResetMock}
      />,
    );

    // Badge count should be "2" since 2 filters are populated
    expect(screen.getByText("2")).toBeInTheDocument();

    // Header reset button should be visible
    const resetBtn = screen.getByRole("button", { name: /Reset all/i });
    expect(resetBtn).toBeInTheDocument();

    // Trigger reset callback from the header button
    fireEvent.click(resetBtn);
    expect(onResetMock).toHaveBeenCalledTimes(1);
  });

  it("triggers onChange with correct parameters when a select dropdown value changes", () => {
    const onChangeMock = vi.fn();

    render(
      <TableFilters
        table="dmp"
        filters={defaultDmpFilters}
        onChange={onChangeMock}
        onApply={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    // Open panel
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));

    // Target the first select element (Chromosome dropdown)
    const selectEl = screen.getAllByRole("combobox")[0]!;
    fireEvent.change(selectEl, { target: { value: "chr1" } });

    expect(onChangeMock).toHaveBeenCalledWith("chr", "chr1");
  });

  it("triggers onChange when a text or numeric input value changes", () => {
    const onChangeMock = vi.fn();

    render(
      <TableFilters
        table="dmp"
        filters={defaultDmpFilters}
        onChange={onChangeMock}
        onApply={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    // Open panel
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));

    // Target the input field for 'Gene (contains)'
    const geneInput = screen.getByPlaceholderText("Gene (contains)");
    fireEvent.change(geneInput, { target: { value: "A" } });

    expect(onChangeMock).toHaveBeenCalledWith("gene", "A");
  });

  it("triggers onApply and panel reset when action buttons inside the panel are clicked", () => {
    const onApplyMock = vi.fn();
    const onResetMock = vi.fn();
    const activeFilters = { ...defaultDmpFilters, gene: "TP53" };

    render(
      <TableFilters
        table="dmp"
        filters={activeFilters}
        onChange={vi.fn()}
        onApply={onApplyMock}
        onReset={onResetMock}
      />,
    );

    // Open panel
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));

    // Find and click the 'Apply' button
    const applyButton = screen.getByRole("button", { name: /^Apply$/i });
    expect(applyButton).not.toBeDisabled();
    fireEvent.click(applyButton);
    expect(onApplyMock).toHaveBeenCalledTimes(1);

    // Find and click the 'Reset' button inside the panel
    const panelResetButton = screen.getByRole("button", { name: /^Reset$/i });
    fireEvent.click(panelResetButton);
    expect(onResetMock).toHaveBeenCalledTimes(1);
  });

  //VALIDATION TESTS FOR COVERING ALL BRANCHES IN validateFilters

  it("validates numerical and range edge-cases and displays correct UI error states", () => {
    const invalidFilters = {
      ...defaultDmpFilters,
      start: "5000",
      stop: "2000", // Case: start > stop
      adj_p_value: "1.5", // Case: > max (1)
      delta_beta: "-0.5", // Case: < min (0)
      log_fc_min: "not_a_num", // Case: non-numerical string
    };

    render(
      <TableFilters
        table="dmp"
        filters={invalidFilters}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    // Open panel to evaluate validation feedback in UI
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));

    // 1. Check for specific validation message strings
    expect(screen.getByText("Stop position must be ≥ start position")).toBeInTheDocument();
    expect(screen.getByText("Adj. P-Value (≤): must be ≤ 1")).toBeInTheDocument();
    expect(screen.getByText("Delta Beta (abs ≥): must be ≥ 0")).toBeInTheDocument();
    expect(screen.getByText("Log FC (abs Min): must be a number")).toBeInTheDocument();

    // 2. Check general blocking text block
    expect(
      screen.getByText("Please fix the highlighted fields before applying."),
    ).toBeInTheDocument();

    // 3. Ensure 'Apply' button is disabled due to errors
    const applyButton = screen.getByRole("button", { name: /^Apply$/i });
    expect(applyButton).toBeDisabled();
  });
});
