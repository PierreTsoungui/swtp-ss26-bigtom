import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UploadPage } from "./UploadPage.tsx";
import { useUploadFlow } from "./hooks/useUploadFlow";
import { DEFAULT_FILTER_SETTINGS, type InspectManifest, type SampleSheetCandidate } from "./types";

/** The full return shape of the mocked upload-flow hook. */
type FlowState = ReturnType<typeof useUploadFlow>;

/** A minimal valid manifest for the review-phase tests. */
const baseManifest: InspectManifest = {
  session_id: "session-123",
  source: "files",
  sample_sheets: [],
  idats: [],
  other_files: [],
  errors: [],
  expires_at: "",
};

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("./hooks/useUploadFlow", () => ({
  useUploadFlow: vi.fn(),
}));

// Mock localized downstream sub-elements to focus completely on the core page layout flow
vi.mock("./components/UploadDropzone", () => ({
  default: ({ onFiles, disabled }: { onFiles?: (files: File[]) => void; disabled?: boolean }) => (
    <div data-testid="upload-dropzone">
      <button disabled={disabled} onClick={() => onFiles?.([])}>
        Simulate Drop
      </button>
    </div>
  ),
}));

vi.mock("./components/UploadSpinner", () => ({
  default: ({ label }: { label: string }) => <div data-testid="upload-spinner">{label}</div>,
}));

vi.mock("./components/FileReviewList", () => ({
  default: ({ onPreviewSheet }: { onPreviewSheet: (sheet: SampleSheetCandidate) => void }) => (
    <div data-testid="file-review-list">
      <button
        onClick={() =>
          onPreviewSheet({ id: "sheet-1", name: "sample.csv" } as SampleSheetCandidate)
        }
      >
        Preview Sheet
      </button>
    </div>
  ),
}));

vi.mock("./components/FilterPanel", () => ({
  default: () => <div data-testid="filter-panel">Filter Settings Form Block</div>,
}));

vi.mock("./components/UploadSampleSheetPreviewModal", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="sample-sheet-preview-modal">
      <span>Preview Active</span>
      <button onClick={onClose}>Close Preview</button>
    </div>
  ),
}));

const mockedUseUploadFlow = vi.mocked(useUploadFlow);

// Default mock model mirroring an active staging session payload.
const mockDefaultFlowState: FlowState = {
  status: "idle",
  error: null,
  manifest: null,
  sheets: [],
  visiblePairs: [],
  completePairs: [],
  selectedSheetId: null,
  blockingError: null,
  selectionHint: null,
  mappingColumns: [],
  columnMapping: {
    sentrix_id: null,
    sentrix_position: null,
    sample_group: null,
    sample_name: null,
  },
  filterSettings: DEFAULT_FILTER_SETTINGS,
  canCommit: false,
  inspect: vi.fn(),
  addFiles: vi.fn(),
  setRole: vi.fn(),
  selectSheet: vi.fn(),
  removePair: vi.fn(),
  setFilterSettings: vi.fn(),
  reset: vi.fn(),
  commit: vi.fn(),
  discardOnUnmount: vi.fn(),
};

function renderUploadPage() {
  return render(
    <MemoryRouter>
      <UploadPage />
    </MemoryRouter>,
  );
}

describe("UploadPage Component Dashboard Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseUploadFlow.mockReturnValue(mockDefaultFlowState);
  });

  it("shows the default single dropzone view in the initial idle state", () => {
    // Arrange & Act
    renderUploadPage();

    // Assert headers and main upload wrapper
    expect(screen.getByRole("heading", { name: /^Upload$/i })).toBeInTheDocument();
    expect(screen.getByTestId("upload-dropzone")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-spinner")).not.toBeInTheDocument();
  });

  it("opens the upload documentation overlay upon clicking help trigger", () => {
    // Arrange & Act
    renderUploadPage();

    const helpButton = screen.getByRole("button", { name: "Open upload help" });
    fireEvent.click(helpButton);

    // Assert markdown descriptors load onto view context
    expect(
      screen.getByText(/The raw data must consist of Illumina IDAT files/i),
    ).toBeInTheDocument();
  });

  it("renders a clear localized banner message if backend file ingestion errors occur", () => {
    // Arrange
    mockedUseUploadFlow.mockReturnValue({
      ...mockDefaultFlowState,
      error: "Malformed manifest configuration payload detected.",
    });

    // Act
    renderUploadPage();

    // Assert error string is visible
    expect(
      screen.getByText("Malformed manifest configuration payload detected."),
    ).toBeInTheDocument();
  });

  it("switches view modes and shows the analysis spinner during the inspecting phase", () => {
    // Arrange
    mockedUseUploadFlow.mockReturnValue({
      ...mockDefaultFlowState,
      status: "inspecting",
    });

    // Act
    renderUploadPage();

    // Assert loading elements mount
    expect(screen.getByTestId("upload-spinner")).toHaveTextContent("Analyzing your upload…");
    expect(screen.queryByTestId("upload-dropzone")).not.toBeInTheDocument();
  });

  it("displays full file manifest details, lists, and filter panels within the review phase", () => {
    // Arrange
    mockedUseUploadFlow.mockReturnValue({
      ...mockDefaultFlowState,
      status: "review",
      manifest: baseManifest,
      canCommit: true, // Enable submit buttons for action checking
    });

    // Act
    renderUploadPage();

    // Assert components layout grid is assembled completely
    expect(screen.getByTestId("upload-dropzone")).toBeInTheDocument();
    expect(screen.getByTestId("file-review-list")).toBeInTheDocument();
    expect(screen.getByTestId("filter-panel")).toBeInTheDocument();

    const startButton = screen.getByRole("button", { name: "Start analysis" });
    expect(startButton).not.toBeDisabled();

    // Test action triggers
    fireEvent.click(startButton);
    expect(mockDefaultFlowState.commit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(mockDefaultFlowState.reset).toHaveBeenCalledTimes(1);
  });

  it("mounts a secondary overlay spinner alongside review tables during final commit submissions", () => {
    // Arrange
    mockedUseUploadFlow.mockReturnValue({
      ...mockDefaultFlowState,
      status: "committing",
      manifest: baseManifest,
    });

    // Act
    renderUploadPage();

    // Assert both review layouts and committing sub-spinners coexist in view space
    expect(screen.getByTestId("file-review-list")).toBeInTheDocument();
    expect(screen.getByTestId("upload-spinner")).toHaveTextContent("Starting the analysis…");
    expect(screen.getByRole("button", { name: "Start over" })).toBeDisabled(); // Buttons lock during busy states
  });

  it("toggles the sample sheet spreadsheet preview modal overlay on and off fluidly", () => {
    // Arrange
    mockedUseUploadFlow.mockReturnValue({
      ...mockDefaultFlowState,
      status: "review",
      manifest: baseManifest,
    });

    renderUploadPage();

    // Act - Trigger child callback to spawn preview state parameters
    fireEvent.click(screen.getByRole("button", { name: "Preview Sheet" }));
    expect(screen.getByTestId("sample-sheet-preview-modal")).toBeInTheDocument();

    // Act - Dismiss preview modal overlay container completely
    fireEvent.click(screen.getByRole("button", { name: "Close Preview" }));
    expect(screen.queryByTestId("sample-sheet-preview-modal")).not.toBeInTheDocument();
  });
});
