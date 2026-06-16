import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { TableTabs } from "./TableTabs";

describe("TableTabs", () => {
  it("renders both tabs", () => {
    render(
      <TableTabs
        activeTab="dmp"
        onChange={() => {}}
      />
    );

    expect(
      screen.getByText("DMP Analysis")
    ).toBeInTheDocument();

    expect(
      screen.getByText("DMR Analysis")
    ).toBeInTheDocument();
  });

  it("highlights active tab", () => {
    render(
      <TableTabs
        activeTab="dmp"
        onChange={() => {}}
      />
    );

    const dmpTab =
      screen.getByRole("tab", {
        name: "DMP Analysis",
      });

    expect(dmpTab).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("calls onChange when clicking DMR tab", () => {
    const onChange = vi.fn();

    render(
      <TableTabs
        activeTab="dmp"
        onChange={onChange}
      />
    );

    fireEvent.click(
      screen.getByText("DMR Analysis")
    );

    expect(onChange).toHaveBeenCalledTimes(1);

    expect(onChange).toHaveBeenCalledWith(
      "dmr"
    );
  });

  it("shows the help text for the active DMP analysis", () => {
    render(<TableTabs activeTab="dmp" onChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Hilfe zur DMP-Analyse öffnen" }));

    expect(screen.getByText(/Differentially Methylated Positions/i)).toBeInTheDocument();
    expect(screen.getByText(/positive Delta Beta indicates higher methylation/i)).toBeInTheDocument();
  });

  it("shows the help text for the active DMR analysis", () => {
    render(<TableTabs activeTab="dmr" onChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Hilfe zur DMR-Analyse öffnen" }));

    expect(screen.getByText(/Differentially Methylated Regions/i)).toBeInTheDocument();
    expect(screen.getByText(/genomic coordinates, region size/i)).toBeInTheDocument();
  });
});
