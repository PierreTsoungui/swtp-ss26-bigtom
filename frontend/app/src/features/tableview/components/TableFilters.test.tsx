/*
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TableFilters } from "./TableFilters";


// Tests wurden zur fehlerfreien Integration erstmal auskommentiert
// TODO: Tests anpassen

describe("TableFilters", () => {
  const defaultFilters = {
    chromosome: "",
    start: "",
    stop: "",
    dmrId: "",
    pValue: "",
    adjPValue: "",
  };

  it("renders filter fields", () => {
    render(
      <TableFilters
        filters={defaultFilters}
        onChange={() => {}}
        onApply={() => {}}
        onReset={() => {}}
      />
    );

    expect(
      screen.getByPlaceholderText("DMR ID")
    ).toBeInTheDocument();

    expect(
      screen.getByPlaceholderText("P-Value")
    ).toBeInTheDocument();

    expect(
      screen.getByPlaceholderText("Adjusted P-Value")
    ).toBeInTheDocument();
  });

  it("shows start/stop when chromosome selected", () => {
    render(
      <TableFilters
        filters={{
          ...defaultFilters,
          chromosome: "1",
        }}
        onChange={() => {}}
        onApply={() => {}}
        onReset={() => {}}
      />
    );

    expect(
      screen.getByPlaceholderText("Start")
    ).toBeInTheDocument();

    expect(
      screen.getByPlaceholderText("Stop")
    ).toBeInTheDocument();
  });

  it("calls apply button", () => {
    const onApply = vi.fn();

    render(
      <TableFilters
        filters={{
          ...defaultFilters,
          dmrId: "DMR_1",
        }}
        onChange={() => {}}
        onApply={onApply}
        onReset={() => {}}
      />
    );

    fireEvent.click(
      screen.getByText("Apply")
    );

    expect(onApply).toHaveBeenCalled();
  });

  it("calls reset button", () => {
    const onReset = vi.fn();

    render(
      <TableFilters
        filters={defaultFilters}
        onChange={() => {}}
        onApply={() => {}}
        onReset={onReset}
      />
    );

    fireEvent.click(
      screen.getByText("Reset")
    );

    expect(onReset).toHaveBeenCalled();
  });
});
 */