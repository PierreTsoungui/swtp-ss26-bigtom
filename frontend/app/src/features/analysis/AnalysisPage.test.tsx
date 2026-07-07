import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisPage } from "./AnalysisPage";
import { useJobPolling } from "@shared/hooks/useJobPolling.ts";
import { useFilterStats } from "./hooks/useFilterStats";
import { JobPhase, type JobStatus, JobStatusValue } from "@shared/types/JobTypes.ts";
import type { FilteringStatsType } from "./types";

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

let mockJobId: string | undefined = "test-job-123";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({
      job_id: mockJobId,
    }),
  };
});

vi.mock("../../shared/hooks/useJobPolling", () => ({ useJobPolling: vi.fn() }));
vi.mock("./hooks/useFilterStats", () => ({ useFilterStats: vi.fn() }));

vi.mock("./components/FilteringStats", () => ({
  FilteringStats: () => (
    <div data-testid="filtering-stats-content">Filtering Stats Component Mounted</div>
  ),
}));

const mockedUseJobPolling = vi.mocked(useJobPolling);
const mockedUseFilterStats = vi.mocked(useFilterStats);

function buildJobStatus(overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    job_id: "test-job-123",
    status: JobStatusValue.RUNNING,
    phase: JobPhase.NORMALIZATION_PREVIEW,
    progress_percent: 45,
    current_step: "Calculating normalization distributions...",
    ...overrides,
  };
}

function renderAnalysisPage() {
  return render(
    <MemoryRouter>
      <AnalysisPage />
    </MemoryRouter>,
  );
}

describe("AnalysisPage Component Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobId = "test-job-123";

    mockedUseFilterStats.mockReturnValue({
      filterStats: null,
      isLoading: false,
      error: null,
    });
  });

  it("renders block notice when the job_id route parameter is missing completely", () => {
    mockJobId = undefined;

    renderAnalysisPage();

    expect(screen.getByText("Analysis Not Available")).toBeInTheDocument();
    expect(screen.getByText(/No job identifier was provided/i)).toBeInTheDocument();
  });

  it("renders global fallback splash panel while waiting for the initial useJobPolling socket layer response", () => {
    mockedUseJobPolling.mockReturnValue(null);

    renderAnalysisPage();

    expect(screen.getByText("Preparing Analysis Pipeline")).toBeInTheDocument();
    expect(screen.getByText(/The analysis process is being initialized/i)).toBeInTheDocument();
  });

  it("renders specialized statistics loading layout when filtering data summaries are being fetched", () => {
    mockedUseJobPolling.mockReturnValue(buildJobStatus());
    mockedUseFilterStats.mockReturnValue({
      filterStats: null,
      isLoading: true,
      error: null,
    });

    renderAnalysisPage();

    expect(screen.getByText("Preparing Filter Statistics")).toBeInTheDocument();
  });

  it("renders the Progressbar with a disabled Next button action trigger while calculations are active", () => {
    mockedUseJobPolling.mockReturnValue(buildJobStatus());

    renderAnalysisPage();

    // We verify the actual embedded Progressbar contents directly
    expect(
      screen.getByRole("heading", { name: "Creating normalization preview..." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("enables the action trigger and presents a confirmation alert when the calculation clears successfully", () => {
    mockedUseJobPolling.mockReturnValue(
      buildJobStatus({
        status: JobStatusValue.COMPLETED,
        phase: JobPhase.NORMALIZATION_PREVIEW,
        progress_percent: 100,
      }),
    );

    renderAnalysisPage();

    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByText("Normalization preview successfully calculated")).toBeInTheDocument();
  });

  it("routes traffic smoothly to the next selection component upon clicking an active navigation button", () => {
    mockedUseJobPolling.mockReturnValue(
      buildJobStatus({
        status: JobStatusValue.WAITING,
        phase: JobPhase.NORMALIZATION,
        progress_percent: 100,
      }),
    );

    renderAnalysisPage();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(mockNavigate).toHaveBeenCalledWith("/normalization/test-job-123");
  });

  it("renders standalone full-screen error cards if processing fails prior to generating metrics tables", () => {
    mockedUseJobPolling.mockReturnValue(
      buildJobStatus({
        status: JobStatusValue.FAILED,
        error: {
          type: "Fatal",
          title: "Error",
          status: 500,
          detail: "Critical core memory fault encountered inside computational nodes.",
          instance: "/api",
        },
      }),
    );

    renderAnalysisPage();

    expect(screen.getByText("Analysis failed")).toBeInTheDocument();
    expect(
      screen.getByText("Critical core memory fault encountered inside computational nodes."),
    ).toBeInTheDocument();
  });

  it("renders integrated localized warning boxes alongside statistics lists if downstream sub-tasks fail", () => {
    mockedUseJobPolling.mockReturnValue(
      buildJobStatus({
        status: JobStatusValue.FAILED,
        error: {
          type: "Err",
          title: "Fail",
          status: 500,
          detail: "Preview generation collapsed.",
          instance: "",
        },
      }),
    );
    mockedUseFilterStats.mockReturnValue({
      filterStats: { total_start: 100 } as unknown as FilteringStatsType,
      isLoading: false,
      error: null,
    });

    renderAnalysisPage();

    expect(screen.getByText("Normalization preview failed")).toBeInTheDocument();
    expect(screen.getByText("Preview generation collapsed.")).toBeInTheDocument();
    expect(screen.getByTestId("filtering-stats-content")).toBeInTheDocument();
  });
});
