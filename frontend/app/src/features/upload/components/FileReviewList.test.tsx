import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import FileReviewList from "./FileReviewList";
import type { RoleSelection } from "./ColumnRoleMapper";
import type { IdatPair, OtherFile, SampleSheetCandidate } from "../types";

const sheet: SampleSheetCandidate = {
  id: "sheet-1",
  name: "SampleSheet.csv",
  rel_path: "data/SampleSheet.csv",
  size_bytes: 100,
  recognized: true,
  recommended: true,
  sample_count: 4,
  columns: ["Sentrix_ID"],
  suggested_mapping: {
    sentrix_id: null,
    sentrix_position: null,
    sample_group: null,
    sample_name: null,
  },
};

const completePair: IdatPair = {
  pair_id: "200_R01C01",
  grn: { name: "g.idat", rel_path: "g.idat", size_bytes: 512 },
  red: { name: "r.idat", rel_path: "r.idat", size_bytes: 512 },
  complete: true,
};

const incompletePair: IdatPair = {
  pair_id: "200_R02C01",
  grn: { name: "g.idat", rel_path: "g.idat", size_bytes: 512 },
  red: null,
  complete: false,
};

const emptyMapping: RoleSelection = {
  sentrix_id: null,
  sentrix_position: null,
  sample_group: null,
  sample_name: null,
};

function renderList(props: Partial<React.ComponentProps<typeof FileReviewList>> = {}) {
  const defaults: React.ComponentProps<typeof FileReviewList> = {
    sheets: [sheet],
    pairs: [completePair, incompletePair],
    otherFiles: [],
    selectedSheetId: null,
    blockingError: null,
    selectionHint: null,
    mappingColumns: [],
    columnMapping: emptyMapping,
    onSetRole: vi.fn(),
    onSelectSheet: vi.fn(),
    onPreviewSheet: vi.fn(),
    onRemovePair: vi.fn(),
  };
  return render(<FileReviewList {...defaults} {...props} />);
}

describe("FileReviewList", () => {
  it("lists sample sheets with their sample count", () => {
    renderList();
    expect(screen.getByText("SampleSheet.csv")).toBeInTheDocument();
    expect(screen.getByText("4 samples")).toBeInTheDocument();
  });

  it("shows a blocking error and a selection hint when provided", () => {
    renderList({ blockingError: "No sample sheet detected", selectionHint: "Pick a sheet" });
    expect(screen.getByText("No sample sheet detected")).toBeInTheDocument();
    expect(screen.getByText("Pick a sheet")).toBeInTheDocument();
  });

  it("summarizes complete and incomplete IDAT pairs", () => {
    renderList();
    expect(screen.getByText(/1 complete/)).toBeInTheDocument();
    expect(screen.getByText(/Grn \+ Red · 1.0 KB/)).toBeInTheDocument();
    expect(screen.getByText(/Incomplete — missing Red/)).toBeInTheDocument();
  });

  it("selects a sheet and opens its preview", () => {
    const onSelectSheet = vi.fn();
    const onPreviewSheet = vi.fn();
    renderList({ onSelectSheet, onPreviewSheet });

    fireEvent.click(screen.getByRole("radio"));
    expect(onSelectSheet).toHaveBeenCalledWith("sheet-1");

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(onPreviewSheet).toHaveBeenCalledWith(sheet);
  });

  it("removes an IDAT pair", () => {
    const onRemovePair = vi.fn();
    renderList({ onRemovePair });

    fireEvent.click(screen.getByRole("button", { name: "Remove 200_R01C01" }));
    expect(onRemovePair).toHaveBeenCalledWith("200_R01C01");
  });

  it("renders the role mapper only when a sheet is selected with columns", () => {
    const { rerender } = renderList({ selectedSheetId: null, mappingColumns: [] });
    expect(screen.queryByText(/Sentrix_ID/)).not.toBeInTheDocument();

    rerender(
      <FileReviewList
        sheets={[sheet]}
        pairs={[]}
        otherFiles={[]}
        selectedSheetId="sheet-1"
        blockingError={null}
        selectionHint={null}
        mappingColumns={["Sentrix_ID"]}
        columnMapping={emptyMapping}
        onSetRole={vi.fn()}
        onSelectSheet={vi.fn()}
        onPreviewSheet={vi.fn()}
        onRemovePair={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/Sentrix_ID/).length).toBeGreaterThan(0);
  });

  it("lists ignored files in a details disclosure", () => {
    const otherFiles: OtherFile[] = [
      { name: "readme.txt", rel_path: "readme.txt", reason: "unsupported" },
    ];
    renderList({ otherFiles });
    expect(screen.getByText("Ignored files (1)")).toBeInTheDocument();
    expect(screen.getByText(/readme.txt — unsupported/)).toBeInTheDocument();
  });
});
