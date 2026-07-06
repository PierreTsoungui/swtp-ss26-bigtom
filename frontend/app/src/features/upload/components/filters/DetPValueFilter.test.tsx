import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DetPValueFilter } from "./DetPValueFilter";
import type { DetPFilterType } from "../../types";

const value: DetPFilterType = { enabled: true, cutoff: 0.03 };

/** Expands the accordion so its detail inputs become accessible. */
function expandPanel() {
  fireEvent.click(screen.getByRole("button", { name: /Detection P-Value Filter/ }));
}

describe("DetPValueFilter", () => {
  it("toggles the enabled flag", () => {
    const onChange = vi.fn();
    render(<DetPValueFilter value={value} onChange={onChange} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({ enabled: false, cutoff: 0.03 });
  });

  it("clamps an out-of-range cutoff to the maximum on change", () => {
    const onChange = vi.fn();
    render(<DetPValueFilter value={value} onChange={onChange} />);
    expandPanel();

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0.9" } });
    expect(onChange).toHaveBeenCalledWith({ enabled: true, cutoff: 0.05 });
  });

  it("shows a validation error when the provided cutoff is out of range", () => {
    render(<DetPValueFilter value={{ enabled: true, cutoff: 0.9 }} onChange={vi.fn()} />);
    expandPanel();
    expect(screen.getByText("Value must be at most 0.05")).toBeInTheDocument();
  });

  it("disables the cutoff input when the filter is off", () => {
    render(<DetPValueFilter value={{ enabled: false, cutoff: 0.03 }} onChange={vi.fn()} />);
    expandPanel();
    expect(screen.getByRole("spinbutton")).toBeDisabled();
  });
});
