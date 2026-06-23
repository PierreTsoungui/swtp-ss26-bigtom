import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import Progressbar from "../../../shared/components/Progressbar.tsx";
import {JobPhase, type JobStatus, JobStatusValue} from "../../../shared/utils/JobTypes.ts";

// MUI LinearProgress mocken da es kein echtes DOM-Rendering braucht
vi.mock("@mui/material/LinearProgress", () => ({
    default: ({ value }: { value: number }) => (
        <div role="progressbar" aria-valuenow={value} data-testid="linear-progress" />
    ),
}));

vi.mock("react-router", () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock("../hooks/useJobCancel", () => ({
    useJobCancel: () => ({
        cancelJob: vi.fn(),
        isLoading: false,
        error: null,
    }),
}));

vi.mock("../components/CancelButton", () => ({
    default: ({ onCancel }: any) => (
        <button onClick={onCancel}>Analyse abbrechen</button>
    ),
}));


// ── Hilfsfunktion für Testdaten ───────────────────────────────
function buildJobStatus(overrides: Partial<JobStatus> = {}): JobStatus {
    return {
        job_id: "test-uuid-1234",
        status: JobStatusValue.RUNNING,
        phase: JobPhase.FILTERING,
        progress_percent: 50,
        current_step: "SNP-Filter wird angewendet...",
        ...overrides,
    };
}

// ── Tests ─────────────────────────────────────────────────────
describe("Progressbar", () => {

    describe("Grundlegende Darstellung", () => {
        it("zeigt die Überschrift 'Analyse läuft' an", () => {
            render(<Progressbar jobStatus={buildJobStatus()} />);
            expect(screen.getByText("Analyse läuft")).toBeInTheDocument();
        });

        /*it("zeigt steps_completed und steps_total korrekt an", () => {
            render(<Progressbar jobStatus={buildJobStatus({
                steps_completed: 3,
                steps_total: 6,
            })} />);
            expect(screen.getByText("Schritte 3 von 6")).toBeInTheDocument();
        });*/

        it("zeigt den aktuellen Schritt als Text an", () => {
            render(<Progressbar jobStatus={buildJobStatus({
                current_step: "Detection p-value Filter wird angewendet...",
            })} />);
            expect(
                screen.getByText("Detection p-value Filter wird angewendet...")
            ).toBeInTheDocument();
        });

        it("zeigt den Prozentwert korrekt an", () => {
            render(<Progressbar jobStatus={buildJobStatus({ progress_percent: 75 })} />);
            expect(screen.getByText("75%")).toBeInTheDocument();
        });

        it("zeigt Next Button an", () => {
            render(<Progressbar jobStatus={buildJobStatus()} showNextButton />);
            expect(screen.getByText("Next")).toBeInTheDocument();
        });

        it("deaktiviert Next während Verarbeitung", () => {
            render(
                <Progressbar
                jobStatus={buildJobStatus()}
                showNextButton
                nextDisabled={true}
                />
            );

            expect(screen.getByText("Next")).toBeDisabled();
        });

        it("aktiviert Next wenn Preview bereit ist", () => {
            // Unklarheit, ob direkt der Übergang zu NORMALIZATION und WAITING geht
            render(
                <Progressbar
                jobStatus={buildJobStatus({
                    status: JobStatusValue.COMPLETED,
                    phase: JobPhase.NORMALIZATION_PREVIEW
                })}
                showNextButton
                nextDisabled={false}
                />
            );

            expect(screen.getByText("Next")).not.toBeDisabled();
        });

        it("ruft onNext auf beim Klick", () => {
            const onNext = vi.fn();

            render(
                <Progressbar
                jobStatus={buildJobStatus()}
                showNextButton={true}
                nextDisabled={false}
                onNext={onNext}
                />
            );

            screen.getByText("Next").click();

            expect(onNext).toHaveBeenCalled();
        });
    });

    describe("Fortschrittsbalken", () => {
        it("übergibt progress_percent korrekt an LinearProgress", () => {
            render(<Progressbar jobStatus={buildJobStatus({ progress_percent: 65 })} />);
            const bar = screen.getByTestId("linear-progress");
            expect(bar).toHaveAttribute("aria-valuenow", "65");
        });

        it("zeigt 0% korrekt an", () => {
            render(<Progressbar jobStatus={buildJobStatus({ progress_percent: 0 })} />);
            expect(screen.getByText("0%")).toBeInTheDocument();
            expect(screen.getByTestId("linear-progress")).toHaveAttribute("aria-valuenow", "0");
        });

        it("zeigt 100% korrekt an", () => {
            render(<Progressbar jobStatus={buildJobStatus({ progress_percent: 100 })} />);
            expect(screen.getByText("100%")).toBeInTheDocument();
            expect(screen.getByTestId("linear-progress")).toHaveAttribute("aria-valuenow", "100");
        });

    });

    describe("CancelButton", () => {
        it("zeigt den Abbrechen-Button an", () => {
            render(<Progressbar jobStatus={buildJobStatus()} />);
            expect(
                screen.getByRole("button", { name: "Cancel" })
            ).toBeInTheDocument();
        });
    });

    describe("Verschiedene Job-Zustände", () => {
        it("rendert korrekt bei Status 'queued'", () => {
            render(<Progressbar jobStatus={buildJobStatus({
                status: JobStatusValue.WAITING,
                progress_percent: 0,
                current_step: "Warte auf Start...",
            })} />);
            expect(screen.getByText("Warte auf Start...")).toBeInTheDocument();
            // expect(screen.getByText("Schritte 0 von 6")).toBeInTheDocument();
        });

        it("rendert korrekt bei Status 'filtering'", () => {
            render(<Progressbar jobStatus={buildJobStatus({
                status: "running",
                phase: "filtering",
                progress_percent: 38,
                current_step: "Detection p-value Filter wird angewendet...",
            })} />);
            expect(
                screen.getByText("Detection p-value Filter wird angewendet...")
            ).toBeInTheDocument();
            expect(screen.getByText("38%")).toBeInTheDocument();
        });
    });
});