import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SkeletonTable from "./SkeletonTable";

describe("SkeletonTable", () => {
  it("renders the requested number of rows and columns", () => {
    const { container } = render(<SkeletonTable rows={3} columns={4} />);

    // 1 header row + 3 body rows.
    expect(container.querySelectorAll("tr")).toHaveLength(4);
    // 4 header cells + 3*4 body cells = 16 cells.
    expect(container.querySelectorAll("td, th")).toHaveLength(16);
    expect(container.querySelectorAll(".MuiSkeleton-root").length).toBeGreaterThan(0);
  });

  it("falls back to sensible defaults", () => {
    const { container } = render(<SkeletonTable />);
    // Default 10 rows + 1 header row.
    expect(container.querySelectorAll("tr")).toHaveLength(11);
  });
});
