import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NormalizationPage } from "./NormalizationPage";
import { useNormalizationPreview } from "./hooks/useNormalizationPreview";
import { useNormalizationSubmit } from "./hooks/useNormalizationSubmit";
import { useJobPolling } from "../../shared/hooks/useJobPolling";
import { JobPhase, type JobStatus, JobStatusValue } from "../../shared/types/JobTypes.ts";
import type { MethodPreview, NormalizationPreview } from "./types";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ job_id: "test-job-999" }),
  };
});

vi.mock("./hooks/useNormalizationPreview", () => ({ useNormalizationPreview: vi.fn() }));
vi.mock("./hooks/useNormalizationSubmit", () => ({ useNormalizationSubmit: vi.fn() }));
vi.mock("../../shared/hooks/useJobPolling", () => ({ useJobPolling: vi.fn() }));

vi.mock("./components/LoadingScreen.tsx", () => ({
  default: ({ message }: { message: string }) => <div data-testid="loading-screen">{message}</div>,
}));

vi.mock("./components/MethodCard.tsx", () => ({
  default: ({
    method,
    isSelected,
    onSelect,
    onPcaClick,
  }: {
    method: MethodPreview;
    isSelected: boolean;
    onSelect: (m: MethodPreview["method"]) => void;
    onPcaClick: (m: MethodPreview) => void;
  }) => (
    <div data-testid={`method-card-${method.method}`} className={isSelected ? "selected" : ""}>
      <button onClick={() => onSelect(method.method)}>Select {method.method}</button>
      <button onClick={() => onPcaClick(method)}>Zoom PCA {method.method}</button>
    </div>
  ),
}));

vi.mock("./components/PcaViewer.tsx", () => ({
  default: ({ method, onClose }: { method: string; onClose: () => void }) => (
    <div data-testid="pca-viewer-modal">
      <span>Expanded Modal View: {method}</span>
      <button onClick={onClose}>Close Viewer</button>
    </div>
  ),
}));

const preview: NormalizationPreview = {
  job_id: "test-job-999",
  methods: [
    {
      method: "raw",
      density_url: "/raw.png",
      pca: { points: [{ sample: "s1", group: "A", pc1: 0, pc2: 0 }] },
    },
    { method: "noob", density_url: "/noob.png", pca: { points: [] } },
  ],
};

const mockedPreview = vi.mocked(useNormalizationPreview);
const mockedSubmit = vi.mocked(useNormalizationSubmit);
const mockedPolling = vi.mocked(useJobPolling);

const submitMethod = vi.fn().mockResolvedValue(true);
const setError = vi.fn();

function renderPage() {
  return render(
    <MemoryRouter>
      <NormalizationPage />
    </MemoryRouter>,
  );
}

describe("NormalizationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitMethod.mockResolvedValue(true);
    mockedPreview.mockReturnValue({ data: preview, isLoading: false, error: null, setError });
    mockedSubmit.mockReturnValue({ submitMethod, isSubmitting: false });
    mockedPolling.mockReturnValue(null);
  });

  it("renders the heading and help integration", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Choose a normalization method" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Help with normalization" }));
    expect(screen.getByText(/Why is normalization necessary/i)).toBeInTheDocument();
  });

  it("shows the loading screen while previews load", () => {
    mockedPreview.mockReturnValue({ data: null, isLoading: true, error: null, setError });
    renderPage();
    expect(screen.getByTestId("loading-screen")).toHaveTextContent(
      "Loading normalization previews...",
    );
  });

  it("renders the error message on failure", () => {
    mockedPreview.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Database dropped",
      setError,
    });
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("Database dropped");
  });

  it("enables Confirm after a selection and submits the chosen method", async () => {
    renderPage();

    const confirm = screen.getByRole("button", { name: "Confirm method" });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Select noob" }));
    expect(confirm).not.toBeDisabled();

    fireEvent.click(confirm);

    await waitFor(() => expect(submitMethod).toHaveBeenCalledWith("noob"));
  });

  it("navigates to the batch page once polling reports batch/waiting", async () => {
    mockedPolling.mockReturnValue({
      job_id: "test-job-999",
      status: JobStatusValue.WAITING,
      phase: JobPhase.BATCH,
      progress_percent: 100,
      current_step: "Moving to batch...",
    } satisfies JobStatus);

    renderPage();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/batch/test-job-999"));
  });

  it("opens and closes the interactive PCA viewer", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Zoom PCA raw" }));
    expect(screen.getByTestId("pca-viewer-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close Viewer" }));
    expect(screen.queryByTestId("pca-viewer-modal")).not.toBeInTheDocument();
  });
});
