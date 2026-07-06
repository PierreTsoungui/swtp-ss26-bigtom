import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import NonCpgFilter from "./NonCpgFilter";
import MultiHitFilter from "./MultiHitFilter";
import XYChromosomesFilter from "./XYChromosomesFilter";

/**
 * The three "toggle-only" probe filters share the same contract: a labelled
 * switch that flips the single `enabled` flag. They are grouped here to keep the
 * repetitive coverage in one place.
 */
describe("toggle-only probe filters", () => {
  it.each([
    ["Non-CpG Filter", NonCpgFilter],
    ["Multi Hit Filter", MultiHitFilter],
    ["XY Chromosomes Filter", XYChromosomesFilter],
  ])("%s toggles its enabled flag", (_label, Filter) => {
    const onChange = vi.fn();
    render(<Filter value={{ enabled: false }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({ enabled: true });
  });

  it("reflects the current enabled state on the switch", () => {
    render(<NonCpgFilter value={{ enabled: true }} onChange={vi.fn()} />);
    expect(screen.getByRole("switch")).toBeChecked();
  });
});
