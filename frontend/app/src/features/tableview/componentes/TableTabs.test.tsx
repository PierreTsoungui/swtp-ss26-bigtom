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
});