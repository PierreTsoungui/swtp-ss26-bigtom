import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NormalizationPage } from "./NormalizationPage";
import { useNormalizationPreview } from "./hooks/useNormalizationPreview";
import { useJobPolling } from "../analysis/hooks/useJobPolling";
import { JobPhase, JobStatusValue } from "../../shared/utils/JobTypes.ts";
import type { NormalizationMethod } from "./utils/types";

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ job_id: "test-job-999" }),
  };
});

vi.mock("./hooks/useNormalizationPreview", () => ({ useNormalizationPreview: vi.fn() }));
vi.mock("../analysis/hooks/useJobPolling.ts", () => ({ useJobPolling: vi.fn() }));

vi.mock("./components/LoadingScreen.tsx", () => ({
  default: ({ message }: { message: string }) => <div data-testid="loading-screen">{message}</div>,
}));

vi.mock("./components/MethodCard.tsx", () => ({
  default: ({ method, isSelected, onSelect, onPcaClick }: any) => (
    <div data-testid={`method-card-${method.method}`} className={isSelected ? "selected" : ""}>
      <span>Card: {method.method}</span>
      <button onClick={() => onSelect(method.method)}>Select {method.method}</button>
      <button onClick={() => onPcaClick(method)}>Zoom PCA {method.method}</button>
    </div>
  ),
}));

vi.mock("./components/PcaViewer.tsx", () => ({
  default: ({ method, onClose }: any) => (
    <div data-testid="pca-viewer-modal">
      <span>Expanded Modal View: {method}</span>
      <button onClick={onClose}>Close Viewer</button>
    </div>
  ),
}));

// Added missing 'points' array structures to satisfy the PcaData strict type interface
const mockPreviewPayload = {
  job_id: "test-job-999",
  methods: [
    { method: "RAW" as NormalizationMethod, density_url: "/raw-p", pca: { samples: [], points: [] } },
    { method: "NOOB" as NormalizationMethod, density_url: "/noob-p", pca: { samples: [] as any, points: [] as any } },
  ],
};

global.fetch = vi.fn();

describe("NormalizationPage Component Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNormalizationPreview).mockReturnValue({ data: mockPreviewPayload as any, isLoading: false, error: null, setError: vi.fn() });
    vi.mocked(useJobPolling).mockReturnValue(null);
    (global.fetch as any).mockResolvedValue({ ok: true });
  });

  it("renders the help button documentation integration successfully", () => {
    render(<MemoryRouter><NormalizationPage /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Choose a normalization method" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Help with normalization" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Help with normalization" }));
    expect(screen.getByText(/Why is normalization necessary/i)).toBeInTheDocument();
  });

  it("displays explicit loading message wrappers when background requests are pending", () => {
    vi.mocked(useNormalizationPreview).mockReturnValue({ data: null, isLoading: true, error: null, setError: vi.fn() });
    render(<MemoryRouter><NormalizationPage /></MemoryRouter>);

    expect(screen.getByTestId("loading-screen")).toHaveTextContent("Loading normalization previews...");
  });

  it("renders targeted error message contents gracefully upon operational failures", () => {
    vi.mocked(useNormalizationPreview).mockReturnValue({ data: null, isLoading: false, error: "Database Connection Dropped", setError: vi.fn() });
    render(<MemoryRouter><NormalizationPage /></MemoryRouter>);

    expect(screen.getByRole("alert")).toHaveTextContent("Database Connection Dropped");
  });

  it("manages method selections, triggers POST calls and displays button execution changes", async () => {
    render(<MemoryRouter><NormalizationPage /></MemoryRouter>);

    const confirmButton = screen.getByRole("button", { name: "Confirm method" });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Select NOOB" }));
    expect(confirmButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/normalize/test-job-999",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ method: "NOOB" }),
        })
      );
    });
  });

  it("mounts the asynchronous progress bar component and navigates to the batch view when polling status shifts", async () => {
    vi.mocked(useJobPolling).mockReturnValue({
      job_id: "test-job-999",
      status: JobStatusValue.WAITING,
      phase: JobPhase.BATCH,
      progress_percent: 100,
      current_step: "Moving to Batch stages...",
    });

    await act(async () => {
      render(<MemoryRouter><NormalizationPage /></MemoryRouter>);
    });

    expect(mockNavigate).toHaveBeenCalledWith("/batch/test-job-999");
  });

  it("toggles the enlarged modal viewer overlay on and off smoothly upon card actions", () => {
    render(<MemoryRouter><NormalizationPage /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Zoom PCA RAW" }));
    expect(screen.getByTestId("pca-viewer-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close Viewer" }));
    expect(screen.queryByTestId("pca-viewer-modal")).not.toBeInTheDocument();
  });
});
