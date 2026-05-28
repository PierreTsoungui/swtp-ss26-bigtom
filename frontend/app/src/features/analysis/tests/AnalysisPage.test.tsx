/*import { render, screen } from "@testing-library/react";
//import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";

import { AnalysisPage } from "../AnalysisPage";
import type { JobStatus } from "../utils/types";

// ── Mocks ─────────────────────────────────────────────────────

const mockNavigate = vi.fn();

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
    FilteringStats: ({ stats }: any) => (
        <div data-testid="filtering-stats">
            Filtering Stats geladen
            <span>{JSON.stringify(stats)}</span>
        </div>
    ),
}));

vi.mock("../utils/helpers.ts", () => ({
    convertBackendFilterStats: (stats: unknown) => stats,
}));

vi.mock("@mui/material/CircularProgress", () => ({
    default: () => (
        <div data-testid="circular-progress">
            Loading Spinner
        </div>
    ),
}));

// ── Test-Komponente für die neue Preview-Progressbar ──────────
// Falls du eine eigene Komponente hast -> Import statt Mock verwenden
vi.mock("../components/NormalizationPreviewProgress.tsx", () => ({
    default: ({
                  progress,
                  disabled,
                  onNext,
              }: {
        progress: number;
        disabled: boolean;
        onNext: () => void;
    }) => (
        <div data-testid="preview-progress">
            <p>Preview Fortschritt: {progress}%</p>

            <div
                role="progressbar"
                aria-valuenow={progress}
                data-testid="preview-bar"
            />

            <button
                disabled={disabled}
                onClick={onNext}
            >
                Next
            </button>
        </div>
    ),
}));

// ── Hook import nach Mock ─────────────────────────────────────
import { useJobPolling } from "../hooks/useJobPolling";

const mockedUseJobPolling = vi.mocked(useJobPolling);

// ── Hilfsfunktion ─────────────────────────────────────────────

function buildJobStatus(
    overrides: Partial<JobStatus> = {}
): JobStatus {
    return {
        job_id: "test-job-123",
        status: "running",
        phase: "normalization_preview",
        progress_percent: 45,
        current_step: "Normalisierungsvorschau wird erstellt...",
        steps_total: 6,
        steps_completed: 5,
        estimated_seconds_remaining: 20,

        filter_stats: {
            total_before: 1000,
            remaining: 850,
            steps: [
                {
                    name: "SNP Filter",
                    removed: 50,
                },
            ],
        },

        ...overrides,
    };
}

// ── Tests ─────────────────────────────────────────────────────

describe("AnalysisPage", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("Normalisierungs-Preview läuft", () => {

        it("zeigt weiterhin die Filterstatistik an", () => {
            mockedUseJobPolling.mockReturnValue(
                buildJobStatus()
            );

            render(
                <MemoryRouter>
                    <AnalysisPage />
                </MemoryRouter>
            );

            expect(
               screen.getAllByTestId("filtering-stats")[0]
            ).toBeInTheDocument();

            expect(
                screen.getByText("Filtering Stats geladen")
            ).toBeInTheDocument();
        });

        it("zeigt die Progressbar für die Preview an", () => {
            mockedUseJobPolling.mockReturnValue(
                buildJobStatus({
                    progress_percent: 55,
                })
            );

            render(
                <MemoryRouter>
                    <AnalysisPage />
                </MemoryRouter>
            );

            expect(
                screen.getByTestId("preview-progress")
            ).toBeInTheDocument();

            expect(screen.getByText("55%")).toBeInTheDocument();
        });

        it("übergibt den Fortschritt korrekt an die Progressbar", () => {
            mockedUseJobPolling.mockReturnValue(
                buildJobStatus({
                    progress_percent: 72,
                })
            );

            render(
                <MemoryRouter>
                    <AnalysisPage />
                </MemoryRouter>
            );

            expect(
                screen.getByRole("progressbar")
            ).toHaveAttribute("aria-valuenow", "72");
        });

        it("zeigt den Next-Button an", () => {
            mockedUseJobPolling.mockReturnValue(
                buildJobStatus()
            );

            render(
                <MemoryRouter>
                    <AnalysisPage />
                </MemoryRouter>
            );

            expect(
                screen.getByRole("button", { name: "Next" })
            ).toBeInTheDocument();
        });

        it("deaktiviert den Next-Button während die Preview läuft", () => {
            mockedUseJobPolling.mockReturnValue(
                buildJobStatus({
                    status: "running",
                    phase: "normalization_preview",
                    progress_percent: 60,
                })
            );

            render(
                <MemoryRouter>
                    <AnalysisPage />
                </MemoryRouter>
            );

            const button = screen.getByRole("button", {
                name: "Next",
            });

            expect(button).toBeDisabled();
        });

        it("aktiviert den Next-Button wenn die Preview fertig ist", () => {
            mockedUseJobPolling.mockReturnValue(
                buildJobStatus({
                    status: "waiting",
                    phase: "waiting_selection",
                    progress_percent: 100,
                })
            );

            render(
                <MemoryRouter>
                    <AnalysisPage />
                </MemoryRouter>
            );

            const button = screen.getByRole("button", {
                name: "Next",
            });

            expect(button).toBeEnabled();
        });

        // it("navigiert zur Normalization Page wenn Next geklickt wird", async () => {
        //     const user = userEvent.setup();

        //     mockedUseJobPolling.mockReturnValue(
        //         buildJobStatus({
        //             status: "waiting",
        //             phase: "waiting_selection",
        //             progress_percent: 100,
        //         })
        //     );

        //     render(
        //         <MemoryRouter>
        //             <AnalysisPage />
        //         </MemoryRouter>
        //     );

        //     const button = screen.getByRole("button", {
        //         name: "Next",
        //     });

        //     await user.click(button);

        //     expect(mockNavigate).toHaveBeenCalled();
        // });
    });

    describe("Fehlerfälle", () => {

        it("zeigt Fehlermeldung wenn Preview fehlgeschlagen ist", () => {
            mockedUseJobPolling.mockReturnValue(
                buildJobStatus({
                    status: "failed",
                    error: {
                        type: "preview-error",
                        title: "Preview Fehler",
                        status: 500,
                        detail: "Preview konnte nicht erstellt werden.",
                        instance: "/api/v1/status/test-job-123",
                    },
                })
            );

            render(
                <MemoryRouter>
                    <AnalysisPage />
                </MemoryRouter>
            );

            expect(
                screen.getByText(
                    "Normalisierungsvorschau fehlgeschlagen"
                )
            ).toBeInTheDocument();

            expect(
                screen.getByText(
                    "Preview konnte nicht erstellt werden."
                )
            ).toBeInTheDocument();
        });

        it("zeigt Filterstatistiken trotz Fehler weiterhin an", () => {
            mockedUseJobPolling.mockReturnValue(
                buildJobStatus({
                    status: "failed",
                })
            );

            render(
                <MemoryRouter>
                    <AnalysisPage />
                </MemoryRouter>
            );

            expect(
                screen.getAllByTestId("filtering-stats")[0]
            ).toBeInTheDocument();
        });
    });

    describe("Sonderfälle", () => {

        it("zeigt Ladezustand wenn jobStatus null ist", () => {
            mockedUseJobPolling.mockReturnValue(null);

            render(
                <MemoryRouter>
                    <AnalysisPage />
                </MemoryRouter>
            );

            expect(
                screen.getByText("Verbindung wird aufgebaut...")
            ).toBeInTheDocument();
        });

        it("zeigt Hinweis wenn keine Filterstatistik vorhanden ist", () => {
            mockedUseJobPolling.mockReturnValue(
                buildJobStatus({
                    filter_stats: null,
                })
            );

            render(
                <MemoryRouter>
                    <AnalysisPage />
                </MemoryRouter>
            );

            expect(
                screen.getByText(
                    "Keine Filterstatistiken für diesen Job verfügbar."
                )
            ).toBeInTheDocument();
        });
    });
});*/