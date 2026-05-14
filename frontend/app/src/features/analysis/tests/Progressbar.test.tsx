// features/analysis/components/__tests__/Progressbar.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type {JobStatus} from "../utils/types.ts";
import Progressbar from "../components/Progressbar.tsx";

// MUI LinearProgress mocken da es kein echtes DOM-Rendering braucht
vi.mock("@mui/material/LinearProgress", () => ({
    default: ({ value }: { value: number }) => (
        <div role="progressbar" aria-valuenow={value} data-testid="linear-progress" />
    ),
}));

// ── Hilfsfunktion für Testdaten ───────────────────────────────
function buildJobStatus(overrides: Partial<JobStatus> = {}): JobStatus {
    return {
        job_id: "test-uuid-1234",
        status: "running",
        phase: "filtering",
        progress_percent: 50,
        current_step: "SNP-Filter wird angewendet...",
        steps_total: 6,
        steps_completed: 3,
        filter_stats: null,
        estimated_seconds_remaining: 30,
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

        it("zeigt steps_completed und steps_total korrekt an", () => {
            render(<Progressbar jobStatus={buildJobStatus({
                steps_completed: 3,
                steps_total: 6,
            })} />);
            expect(screen.getByText("Schritte 3 von 6")).toBeInTheDocument();
        });

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

    describe("Verbleibende Zeit", () => {
        it("zeigt verbleibende Zeit an wenn estimated_seconds_remaining gesetzt ist", () => {
            render(<Progressbar jobStatus={buildJobStatus({
                estimated_seconds_remaining: 45,
            })} />);
            expect(screen.getByText("45 Sekunden")).toBeInTheDocument();
            expect(screen.getByText("Verbleibende Zeit")).toBeInTheDocument();
        });

        it("versteckt verbleibende Zeit wenn estimated_seconds_remaining null ist", () => {
            render(<Progressbar jobStatus={buildJobStatus({
                estimated_seconds_remaining: null,
            })} />);
            expect(screen.queryByText("Verbleibende Zeit")).not.toBeInTheDocument();
            expect(screen.queryByText(/Sekunden/)).not.toBeInTheDocument();
        });

        it("zeigt 0 Sekunden korrekt an", () => {
            render(<Progressbar jobStatus={buildJobStatus({
                estimated_seconds_remaining: 0,
            })} />);
            expect(screen.getByText("0 Sekunden")).toBeInTheDocument();
        });
    });

    describe("CancelButton", () => {
        it("zeigt den Abbrechen-Button an", () => {
            render(<Progressbar jobStatus={buildJobStatus()} />);
            expect(
                screen.getByRole("button", { name: "Analyse abbrechen" })
            ).toBeInTheDocument();
        });

        it("ruft onCancel auf wenn Abbrechen geklickt wird", () => {
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            render(<Progressbar jobStatus={buildJobStatus()} />);

            fireEvent.click(screen.getByRole("button", { name: "Analyse abbrechen" }));

            expect(consoleSpy).toHaveBeenCalledWith("Analyse abgebrochen");
            consoleSpy.mockRestore();
        });
    });

    describe("Verschiedene Job-Zustände", () => {
        it("rendert korrekt bei Status 'queued'", () => {
            render(<Progressbar jobStatus={buildJobStatus({
                status: "queued",
                progress_percent: 0,
                current_step: "Warte auf Start...",
                steps_completed: 0,
            })} />);
            expect(screen.getByText("Warte auf Start...")).toBeInTheDocument();
            expect(screen.getByText("Schritte 0 von 6")).toBeInTheDocument();
        });

        it("rendert korrekt bei Status 'filtering'", () => {
            render(<Progressbar jobStatus={buildJobStatus({
                status: "running",
                phase: "filtering",
                progress_percent: 38,
                current_step: "Detection p-value Filter wird angewendet...",
                steps_completed: 2,
            })} />);
            expect(
                screen.getByText("Detection p-value Filter wird angewendet...")
            ).toBeInTheDocument();
            expect(screen.getByText("38%")).toBeInTheDocument();
        });
    });
});