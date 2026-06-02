import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisPage } from "../AnalysisPage";
import { useJobPolling } from "../hooks/useJobPolling";
import type { JobStatus } from "../utils/types";

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({
      job_id: "test-job-123",
    }),
  };
});

vi.mock("../hooks/useJobPolling", () => ({
  useJobPolling: vi.fn(),
}));

vi.mock("../components/FilteringStats", () => ({
  FilteringStats: () => <div data-testid="filtering-stats-content">Filtering Stats geladen</div>,
}));

vi.mock("../components/Progressbar.tsx", () => ({
  default: ({
    nextDisabled,
    onNext,
  }: {
    nextDisabled?: boolean;
    onNext?: () => void;
  }) => (
    <div data-testid="preview-progressbar">
      <button disabled={nextDisabled} onClick={onNext}>
        Next
      </button>
    </div>
  ),
}));

const mockedUseJobPolling = vi.mocked(useJobPolling);

function buildJobStatus(overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    job_id: "test-job-123",
    status: "running",
    phase: "normalization_preview",
    progress_percent: 45,
    current_step: "Normalisierungsvorschau wird erstellt...",
    steps_total: 6,
    steps_completed: 5,
    estimated_seconds_remaining: 20,
    filter_stats: null,
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

describe("AnalysisPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("zeigt den Ladezustand wenn noch kein Jobstatus vorhanden ist", () => {
    mockedUseJobPolling.mockReturnValue(null);

    renderAnalysisPage();

    expect(screen.getByText("Verbindung wird aufgebaut...")).toBeInTheDocument();
  });

  it("rendert die Progressbar mit deaktiviertem Next-Button waehrend die Preview laeuft", () => {
    mockedUseJobPolling.mockReturnValue(buildJobStatus());

    renderAnalysisPage();

    expect(screen.getByTestId("preview-progressbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("aktiviert den Next-Button wenn die Preview bereit ist", () => {
    mockedUseJobPolling.mockReturnValue(
      buildJobStatus({
        status: "waiting",
        phase: "waiting_selection",
        progress_percent: 100,
      }),
    );

    renderAnalysisPage();

    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("navigiert zur Normalization Page wenn Next geklickt wird", () => {
    mockedUseJobPolling.mockReturnValue(
      buildJobStatus({
        status: "waiting",
        phase: "waiting_selection",
        progress_percent: 100,
      }),
    );

    renderAnalysisPage();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(mockNavigate).toHaveBeenCalledWith("/normalization/test-job-123");
  });

  it("zeigt einen Hinweis wenn keine Filterstatistik vorhanden ist", () => {
    mockedUseJobPolling.mockReturnValue(buildJobStatus({ filter_stats: null }));

    renderAnalysisPage();

    expect(
      screen.getByText(/Keine Filterstatistiken/),
    ).toBeInTheDocument();
  });
});
