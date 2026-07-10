import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SnpFilter from "./SnpFilter";
import type { SnpFilterType } from "../../types";

const value: SnpFilterType = { enabled: true, maf_cutoff: 0.1 };

function expandPanel() {
  fireEvent.click(screen.getByRole("button", { name: /SNP Filter/ }));
}

describe("SnpFilter", () => {
  it("toggles the enabled flag", () => {
    const onChange = vi.fn();
    render(<SnpFilter value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({ enabled: false, maf_cutoff: 0.1 });
  });

  it("clamps the MAF cutoff to the [0, 0.5] range", () => {
    const onChange = vi.fn();
    render(<SnpFilter value={value} onChange={onChange} />);
    expandPanel();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0.9" } });
    expect(onChange).toHaveBeenCalledWith({ enabled: true, maf_cutoff: 0.5 });
  });

  it("flags an out-of-range provided value", () => {
    render(<SnpFilter value={{ enabled: true, maf_cutoff: 0.9 }} onChange={vi.fn()} />);
    expandPanel();
    expect(screen.getByText("Value must be at most 0.5")).toBeInTheDocument();
  });
});
