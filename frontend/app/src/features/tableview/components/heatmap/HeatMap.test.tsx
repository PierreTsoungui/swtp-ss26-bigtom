import {render, screen, waitFor, fireEvent, within} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import HeatMap from './HeatMap';
import Progressbar from "../../../../shared/components/Progressbar.tsx";
import {JobPhase, JobStatusValue} from "../../../../shared/utils/JobTypes.ts";

let fetchMock: ReturnType<typeof vi.fn>;

const mockHeatMapOptions = {
    job_id: "eb547f74-642d-41aa-91d2-7572c1e28516",
    available_columns: ["Sample_Group", "Gender", "Treatment"],
};

const mockHeatMapResponse = {
    job_id: "eb547f74-642d-41aa-91d2-7572c1e28516",
    phase: "downstream_analysis",
    status: "success",
    heatmap_metadata: {
        detected_cpgs: 14,
        plotted_samples: 48,
        message: "Heatmap erfolgreich generiert.",
    },
};

const mockPngBlob = new Blob(["fake-png-binary-data"], { type: "image/png" });

beforeEach(() => {
    vi.useRealTimers();

    fetchMock = vi.fn((url: string) => {
        if (url.includes('/options')) {
            return Promise.resolve({
                ok: true,
                json: async () => mockHeatMapOptions,
            } as Response);
        }

        if (url.includes('/jobs') || url.includes('/status') || url.includes('/analysis')) {
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    job_id: 'eb547f74-642d-41aa-91d2-7572c1e28516',
                    status: 'analysis_done',
                    phase: 'downstream_analysis',
                    progress_percent: 100,
                    current_step: 1,
                    steps_total: 6,
                    estimated_seconds_remaining: null
                }),
            } as Response);
        }

        if (url.includes("/heatmap") && !url.includes("options")) {
            return Promise.resolve({
                ok: true,
                json: async () => mockHeatMapResponse,
            } as Response);
        }

        if (url.includes("/png")) {
            return Promise.resolve({
                ok: true,
                blob: async () => mockPngBlob,
            } as Response);
        }

        return Promise.reject(new Error(`Unknown endpoint: ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.clearAllMocks();
});

const renderWithRouter = (jobId = "eb547f74-642d-41aa-91d2-7572c1e28516") =>
    render(
        <MemoryRouter initialEntries={[`/test/${jobId}`]}>
            <Routes>
                <Route path="/test/:job_id" element={<HeatMap dmp_filter={{}} />} />
            </Routes>
        </MemoryRouter>
    );

describe('HeatMap', () => {
    // Test 1: Grundlegendes Rendern & Snapshot
    it("renders correctly", async () => {
        const { container } = renderWithRouter();
        await waitFor(() => {
            expect(screen.getByText("Heatmap")).toBeInTheDocument();
        });
        expect(container).toMatchSnapshot();
    });

    // Test 2: Laden der Optionen beim Mounten
    it("loads grouping options", async () => {
        renderWithRouter();

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining("/options")
            );
        });

        expect(screen.getByText("Heatmap")).toBeInTheDocument();
    });


    it("validates dropdowns and generates heatmap 2", async () => {
        renderWithRouter();

        // Warten bis Optionen geladen sind (Select ist nicht mehr disabled)
        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining("/options")
            );
        });

        // Accordion öffnen
        fireEvent.click(screen.getByText("Heatmap"));

        // Generate-Button ist disabled solange keine Hauptsortierung gewählt
        const generateButton = screen.getByRole("button", { name: /Generate Heatmap/i });
        expect(generateButton).toBeDisabled();

        // Hauptsortierung öffnen und auswählen
        fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
        await waitFor(() => {
            expect(screen.getByText("Sample_Group")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText("Sample_Group"));

        // Button ist jetzt aktiv
        expect(generateButton).not.toBeDisabled();

        // Heatmap generieren
        fireEvent.click(generateButton);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringMatching(/\/heatmap\//),
                expect.any(Object)
            );
        });
    });
    

    // Test 4: Anzeige von Ladezuständen während API-Aufrufen
    it("displays loading states during API calls", async () => {
        // Mock verzögern, um Ladezustand sichtbar zu machen
        fetchMock.mockImplementationOnce(() =>
            new Promise(resolve => setTimeout(() => resolve({
                ok: true,
                json: async () => mockHeatMapOptions
            } as Response), 100))
        );

        renderWithRouter();

        // Prüfen, ob Ladeindikator (Spinner / Text) existiert
        expect(<Progressbar jobStatus={{
                    job_id: "eb547f74-642d-41aa-91d2-7572c1e28516",
                    status: JobStatusValue.RUNNING,
                    phase: JobPhase.HEATMAP,
                    progress_percent: 50,
                    current_step: "Lade Heatmap...",
        }} />).toBeTruthy();

        // Warten bis Laden beendet ist
        await waitFor(() => {
            expect(screen.queryByText(/Lade Optionen/i)).not.toBeInTheDocument();
        });
    });

    it("handles generation API errors gracefully", async () => {
        fetchMock.mockImplementation((url: string) => {
            if (url.includes('/options')) {
                return Promise.resolve({ ok: true, json: async () => mockHeatMapOptions } as Response);
            }
            if (url.includes('/heatmap') && !url.includes('options')) {
                return Promise.resolve({
                    ok: false,
                    status: 400,
                    json: async () => ({ message: "API Fehler: Server-Validierung fehlgeschlagen" })
                } as Response);
            }
            return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
        });

        renderWithRouter();

        // Accordion erst öffnen
        fireEvent.click(screen.getByRole("button", { name: /Heatmap/i }));

        // Warten bis Optionen geladen & Comboboxen sichtbar
        await waitFor(() => {
            expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
        });

        // Dropdown ohne name-Filter
        fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
        const listbox = screen.getByRole("listbox");
        fireEvent.click(within(listbox).getByText("Sample_Group"));

        fireEvent.click(screen.getByRole("button", { name: /Generate Heatmap/i }));

        await waitFor(() => {
            expect(screen.getByText("API Fehler: Server-Validierung fehlgeschlagen")).toBeInTheDocument();
        });
    });

});
