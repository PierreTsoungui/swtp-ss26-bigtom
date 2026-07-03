import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import UploadView from "./UploadView.tsx";
import { useUploadFlow } from "./hooks/useUploadFlow";

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
  default: ({ onFiles, disabled }: any) => (
    <div data-testid="upload-dropzone">
      <button disabled={disabled} onClick={() => onFiles?.([])}>Simulate Drop</button>
    </div>
  ),
}));

vi.mock("./components/UploadSpinner", () => ({
  default: ({ label }: { label: string }) => <div data-testid="upload-spinner">{label}</div>,
}));

vi.mock("./components/FileReviewList", () => ({
  default: ({ onPreviewSheet }: any) => (
    <div data-testid="file-review-list">
      <button onClick={() => onPreviewSheet({ id: "sheet-1", name: "sample.csv" })}>Preview Sheet</button>
    </div>
  ),
}));

vi.mock("./components/FilterPanel", () => ({
  default: () => <div data-testid="filter-panel">Filter Settings Form Block</div>,
}));

vi.mock("./components/SampleSheetPreviewModal", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="sample-sheet-preview-modal">
      <span>Preview Active</span>
      <button onClick={onClose}>Close Preview</button>
    </div>
  ),
}));

const mockedUseUploadFlow = vi.mocked(useUploadFlow);

// Default mock model mirroring an active staging session payload
const mockDefaultFlowState = {
  status: "idle",
  error: null,
  manifest: null,
  sheets: [],
  visiblePairs: [],
  selectedSheetId: null,
  blockingError: null,
  selectionHint: null,
  mappingColumns: [],
  columnMapping: {} as any,
  filterSettings: {} as any,
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

function renderUploadView() {
  return render(
    <MemoryRouter>
      <UploadView />
    </MemoryRouter>
  );
}

describe("UploadView Component Dashboard Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseUploadFlow.mockReturnValue(mockDefaultFlowState as any);
  });

  it("shows the default single dropzone view in the initial idle state", () => {
    // Arrange & Act
    renderUploadView();

    // Assert headers and main upload wrapper
    expect(screen.getByRole("heading", { name: /^Upload$/i })).toBeInTheDocument();
    expect(screen.getByTestId("upload-dropzone")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-spinner")).not.toBeInTheDocument();
  });

  it("opens the upload documentation overlay upon clicking help trigger", () => {
    // Arrange & Act
    renderUploadView();

    const helpButton = screen.getByRole("button", { name: "Open upload help" });
    fireEvent.click(helpButton);

    // Assert markdown descriptors load onto view context
    expect(screen.getByText(/The raw data must consist of Illumina IDAT files/i)).toBeInTheDocument();
  });

  it("renders a clear localized banner message if backend file ingestion errors occur", () => {
    // Arrange
    mockedUseUploadFlow.mockReturnValue({
      ...mockDefaultFlowState,
      error: "Malformed manifest configuration payload detected.",
    } as any);

    // Act
    renderUploadView();

    // Assert error string is visible
    expect(screen.getByText("Malformed manifest configuration payload detected.")).toBeInTheDocument();
  });

  it("switches view modes and shows the analysis spinner during the inspecting phase", () => {
    // Arrange
    mockedUseUploadFlow.mockReturnValue({
      ...mockDefaultFlowState,
      status: "inspecting",
    } as any);

    // Act
    renderUploadView();

    // Assert loading elements mount
    expect(screen.getByTestId("upload-spinner")).toHaveTextContent("Analyzing your upload…");
    expect(screen.queryByTestId("upload-dropzone")).not.toBeInTheDocument();
  });

  it("displays full file manifest details, lists, and filter panels within the review phase", () => {
    // Arrange
    mockedUseUploadFlow.mockReturnValue({
      ...mockDefaultFlowState,
      status: "review",
      manifest: { session_id: "session-123", other_files: [] },
      canCommit: true, // Enable submit buttons for action checking
    } as any);

    // Act
    renderUploadView();

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
      manifest: { session_id: "session-123", other_files: [] },
    } as any);

    // Act
    renderUploadView();

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
      manifest: { session_id: "session-123", other_files: [] },
    } as any);

    renderUploadView();

    // Act - Trigger child callback to spawn preview state parameters
    fireEvent.click(screen.getByRole("button", { name: "Preview Sheet" }));
    expect(screen.getByTestId("sample-sheet-preview-modal")).toBeInTheDocument();

    // Act - Dismiss preview modal overlay container completely
    fireEvent.click(screen.getByRole("button", { name: "Close Preview" }));
    expect(screen.queryByTestId("sample-sheet-preview-modal")).not.toBeInTheDocument();
  });
});
