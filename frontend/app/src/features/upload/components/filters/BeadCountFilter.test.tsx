import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BeadCountFilter } from "./BeadCountFilter";
import type { BeadCountFilterType } from "../../types";

const value: BeadCountFilterType = { enabled: true, bead_cutoff: 0.05 };

describe("BeadCountFilter", () => {
  it("toggles the enabled flag", () => {
    const onChange = vi.fn();
    render(<BeadCountFilter value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({ enabled: false, bead_cutoff: 0.05 });
  });

  it("clamps the bead cutoff to the [0, 1] range", () => {
    const onChange = vi.fn();
    render(<BeadCountFilter value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Bead Count Filter/ }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith({ enabled: true, bead_cutoff: 1 });
  });
});
