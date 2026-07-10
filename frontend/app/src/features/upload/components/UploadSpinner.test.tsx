import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import UploadSpinner from "./UploadSpinner";

describe("UploadSpinner", () => {
  it("renders the provided label", () => {
    render(<UploadSpinner label="Analyzing your upload…" />);
    expect(screen.getByText("Analyzing your upload…")).toBeInTheDocument();
  });
});
