import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SampleQuality } from "./SampleQuality";
import type { SampleQualityFilterType } from "../../types";

const value: SampleQualityFilterType = {
  enabled: true,
  detection_p_cutoff: 0.03,
  sample_failure_rate: 0.1,
  remove_failed_samples: false,
  enable_pca_outlier_detection: false,
};

/** Expands the accordion so the detail inputs and sub-switches are accessible. */
function expandPanel() {
  fireEvent.click(screen.getByRole("button", { name: /Sample Quality/ }));
}

describe("SampleQuality", () => {
  it("clamps the detection p-value and sample-failure-rate inputs", () => {
    const onChange = vi.fn();
    render(<SampleQuality value={value} onChange={onChange} />);
    expandPanel();

    const [detP, failRate] = screen.getAllByRole("spinbutton");

    fireEvent.change(detP!, { target: { value: "0.9" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ detection_p_cutoff: 0.05 }),
    );

    fireEvent.change(failRate!, { target: { value: "0.9" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ sample_failure_rate: 0.2 }),
    );
  });

  it("toggles the main switch and the two sub-switches", () => {
    const onChange = vi.fn();
    render(<SampleQuality value={value} onChange={onChange} />);
    expandPanel();

    // DOM order: [enabled, remove_failed_samples, enable_pca_outlier_detection]
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]!);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ remove_failed_samples: true }),
    );

    fireEvent.click(switches[2]!);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ enable_pca_outlier_detection: true }),
    );
  });

  it("disables the sub-switches when the filter is off", () => {
    render(<SampleQuality value={{ ...value, enabled: false }} onChange={vi.fn()} />);
    expandPanel();
    const switches = screen.getAllByRole("switch");
    expect(switches[1]).toBeDisabled();
    expect(switches[2]).toBeDisabled();
  });
});
