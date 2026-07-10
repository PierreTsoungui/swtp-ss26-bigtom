import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TableContainer } from "./TableContainer";
import { useTableData } from "../../hooks/useTableData";
import { exportTableCsv } from "../../hooks/exportTableCsv";
import type { TableData } from "../../types";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useParams: () => ({ job_id: "job-1" }) };
});

vi.mock("../../hooks/useTableData", () => ({ useTableData: vi.fn() }));
vi.mock("../../hooks/exportTableCsv", () => ({
  exportTableCsv: vi.fn().mockResolvedValue(undefined),
}));

// The heatmap panel has its own suite; stub it to isolate the container.
vi.mock("../heatmap/HeatMap.tsx", () => ({ default: () => <div data-testid="heatmap" /> }));

const mockedUseTableData = vi.mocked(useTableData);
const mockedExport = vi.mocked(exportTableCsv);

const tableData: TableData = {
  columns: [{ key: "cpg", label: "CpG", type: "string", sortable: true }],
  data: [{ cpg: "cg0001" }, { cpg: "cg0002" }],
  pagination: { page: 1, page_size: 100, total_pages: 1, total_rows: 2 },
};

function renderContainer() {
  return render(
    <MemoryRouter>
      <TableContainer />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseTableData.mockReturnValue({ data: tableData, loading: false, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TableContainer", () => {
  it("renders the DMP/DMR tabs and the data table", () => {
    renderContainer();
    expect(screen.getByRole("tab", { name: "DMP Analysis" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "DMR Analysis" })).toBeInTheDocument();
    expect(screen.getByText("cg0001")).toBeInTheDocument();
  });

  it("shows the loading skeleton while data is loading", () => {
    mockedUseTableData.mockReturnValue({ data: null, loading: true, error: null });
    const { container } = renderContainer();
    expect(container.querySelectorAll(".MuiSkeleton-root").length).toBeGreaterThan(0);
  });

  it("renders the error state", () => {
    mockedUseTableData.mockReturnValue({ data: null, loading: false, error: "Boom" });
    renderContainer();
    expect(screen.getByText(/Error: Boom/)).toBeInTheDocument();
  });

  it("switches to the DMR tab", () => {
    renderContainer();
    fireEvent.click(screen.getByRole("tab", { name: "DMR Analysis" }));
    expect(screen.getByRole("tab", { name: "DMR Analysis" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The heatmap panel is only shown for the DMP tab.
    expect(screen.queryByTestId("heatmap")).not.toBeInTheDocument();
  });

  it("exports the current view as CSV", async () => {
    renderContainer();
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));

    await waitFor(() => expect(mockedExport).toHaveBeenCalledTimes(1));
    const [jobId, table] = mockedExport.mock.calls[0]!;
    expect(jobId).toBe("job-1");
    expect(table).toBe("dmp");
  });

  it("shows the heatmap panel on the DMP tab", () => {
    renderContainer();
    expect(screen.getByTestId("heatmap")).toBeInTheDocument();
  });
});
