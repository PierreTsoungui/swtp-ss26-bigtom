import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BatchPage } from "./BatchPage";
import { useJobPolling } from "../../shared/hooks/useJobPolling";
import { useBatchParameters } from "./hooks/useBatchParameters";
import { useBatchCorrection } from "./hooks/useBatchCorrection";
import { JobPhase, type JobStatus, JobStatusValue } from "../../shared/types/JobTypes.ts";
import type { BatchParametersResponse } from "./types";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

let mockJobId: string | undefined = "job-1";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ job_id: mockJobId }),
  };
});

vi.mock("../../shared/hooks/useJobPolling", () => ({ useJobPolling: vi.fn() }));
vi.mock("./hooks/useBatchParameters", () => ({ useBatchParameters: vi.fn() }));
vi.mock("./hooks/useBatchCorrection", () => ({ useBatchCorrection: vi.fn() }));

// Decouple the page test from the form and plot internals.
vi.mock("./components/BatchForm", () => ({
  BatchForm: (props: {
    onSubmit: (d: unknown) => void;
    onSkip: (s?: unknown) => void;
    isLoading?: boolean;
  }) => (
    <div data-testid="batch-form">
      <span data-testid="form-loading">{String(props.isLoading)}</span>
      <button
        onClick={() =>
          props.onSubmit({ batch_variable: "Sentrix_ID", covariates: ["Sample_Group"] })
        }
      >
        submit-batch
      </button>
      <button
        onClick={() => props.onSkip({ group_column: "g", case_group: "a", control_group: "b" })}
      >
        skip-batch
      </button>
    </div>
  ),
}));

vi.mock("./components/SvdPlot", () => ({
  SvdPlot: () => <div data-testid="svd-plot" />,
}));

const mockedPolling = vi.mocked(useJobPolling);
const mockedParameters = vi.mocked(useBatchParameters);
const mockedCorrection = vi.mocked(useBatchCorrection);

const parameters: BatchParametersResponse = {
  job_id: "job-1",
  columns: [{ name: "Sentrix_ID", levels: 4, values: ["A", "B"] }],
  available_columns: ["Sentrix_ID"],
};

const runBatch = vi.fn().mockResolvedValue(undefined);
const skipBatch = vi.fn().mockResolvedValue(undefined);
const fetchHistory = vi.fn().mockResolvedValue(undefined);

function correctionReturn(overrides: Partial<ReturnType<typeof useBatchCorrection>> = {}) {
  return {
    history: null,
    loading: false,
    error: null,
    isSubmitting: false,
    fetchHistory,
    runBatch,
    skipBatch,
    ...overrides,
  };
}

function jobStatus(overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    job_id: "job-1",
    status: JobStatusValue.RUNNING,
    phase: JobPhase.BATCH,
    progress_percent: 20,
    current_step: "correcting",
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BatchPage />
    </MemoryRouter>,
  );
}

describe("BatchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobId = "job-1";
    mockedPolling.mockReturnValue(null);
    mockedParameters.mockReturnValue({ parameters, isLoading: false, error: null });
    mockedCorrection.mockReturnValue(correctionReturn());
  });

  it("shows a notice when the job id is missing", () => {
    mockJobId = undefined;
    renderPage();
    expect(screen.getByText("No job identifier provided")).toBeInTheDocument();
  });

  it("shows a loading state while parameters or history load", () => {
    mockedParameters.mockReturnValue({ parameters: null, isLoading: true, error: null });
    renderPage();
    expect(screen.getByText("Loading batch data…")).toBeInTheDocument();
  });

  it("renders the heading, form and SVD history", () => {
    mockedCorrection.mockReturnValue(
      correctionReturn({
        history: { job_id: "job-1", rounds: [], current_round: 0, correction_applied: false },
      }),
    );
    renderPage();

    expect(screen.getByRole("heading", { name: "Batch Effect Correction" })).toBeInTheDocument();
    expect(screen.getByTestId("batch-form")).toBeInTheDocument();
    expect(screen.getByTestId("svd-plot")).toBeInTheDocument();
  });

  it("surfaces a system error banner for unrecoverable errors", () => {
    mockedCorrection.mockReturnValue(
      correctionReturn({
        error: { error: "NETWORK_ERROR", message: "Connection to server failed." },
      }),
    );
    renderPage();

    expect(screen.getByText("System Error:")).toBeInTheDocument();
    expect(screen.getByText("Connection to server failed.")).toBeInTheDocument();
  });

  it("does not show a banner for a recoverable validation error", () => {
    mockedCorrection.mockReturnValue(
      correctionReturn({ error: { error: "SKIP_FAILED", message: "nope" } }),
    );
    renderPage();

    expect(screen.queryByText("System Error:")).not.toBeInTheDocument();
  });

  it("runs a batch round on submit", async () => {
    renderPage();
    fireEvent.click(screen.getByText("submit-batch"));

    await waitFor(() =>
      expect(runBatch).toHaveBeenCalledWith({
        batch_correction: { batch_variable: "Sentrix_ID", covariates: ["Sample_Group"] },
      }),
    );
  });

  it("skips to analysis on proceed", async () => {
    renderPage();
    fireEvent.click(screen.getByText("skip-batch"));

    await waitFor(() =>
      expect(skipBatch).toHaveBeenCalledWith({
        group_column: "g",
        case_group: "a",
        control_group: "b",
      }),
    );
  });

  it("navigates to the results page once the pipeline reaches results", async () => {
    mockedPolling.mockReturnValue(
      jobStatus({ phase: JobPhase.RESULTS, status: JobStatusValue.WAITING }),
    );
    renderPage();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/results/job-1"));
  });

  it("renders the progress bar once a round is submitted", async () => {
    mockedPolling.mockReturnValue(jobStatus({ status: JobStatusValue.RUNNING }));
    renderPage();

    fireEvent.click(screen.getByText("submit-batch"));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Analyzing" })).toBeInTheDocument(),
    );
  });
});
