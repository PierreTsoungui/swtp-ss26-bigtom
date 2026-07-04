import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import HeatMap from './HeatMap';
import { JobPhase, JobStatusValue } from "../../../../shared/utils/JobTypes.ts";

let fetchMock: ReturnType<typeof vi.fn>;

const mockHeatMapOptions = {
    job_id: "eb547f74-642d-41aa-91d2-7572c1e28516",
    available_columns: [
        { name: "Sample_Group", type: "categorical", n_distinct: 2 },
        { name: "Gender", type: "categorical", n_distinct: 2 },
        { name: "Treatment", type: "categorical", n_distinct: 3 },
    ],
};

const mockHeatMapResponse = {
    job_id: "eb547f74-642d-41aa-91d2-7572c1e28516",
    phase: JobPhase.HEATMAP,
    status: JobStatusValue.COMPLETED,
    heatmap_metadata: {
        detected_cpgs: 14,
        plotted_samples: 48,
        message: "Heatmap successfully generated.",
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
                    status: JobStatusValue.COMPLETED,
                    phase: JobPhase.RESULTS,
                    progress_percent: 100,
                    current_step: "Done", // Changed from number to string to satisfy parser
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

const renderWithRouter = (rowCount?: number, filters = {}) =>
    render(
        <MemoryRouter initialEntries={["/test/eb547f74-642d-41aa-91d2-7572c1e28516"]}>
            <Routes>
                <Route path="/test/:job_id" element={<HeatMap filters={filters} rowCount={rowCount} />} />
            </Routes>
        </MemoryRouter>
    );

describe('HeatMap Component', () => {
    it("renders correctly and matches snapshot", async () => {
        const { container } = renderWithRouter(50);
        await waitFor(() => {
            expect(screen.getByText("Heatmap")).toBeInTheDocument();
        });
        expect(container).toMatchSnapshot();
    });

    it("loads grouping options upon mount", async () => {
        renderWithRouter(50);
        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/options"));
        });
    });

    it("validates dropdown selections and triggers heatmap generation", async () => {
        renderWithRouter(50);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/options"));
        });

        fireEvent.click(screen.getByRole("button", { name: /Heatmap/i }));

        const generateButton = screen.getByRole("button", { name: /Generate Heatmap/i });
        expect(generateButton).toBeDisabled();

        const comboboxes = screen.getAllByRole("combobox");
        fireEvent.mouseDown(comboboxes[0]);
        await waitFor(() => {
            expect(screen.getByText("Sample_Group")).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText("Sample_Group"));

        expect(generateButton).not.toBeDisabled();
        fireEvent.click(generateButton);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringMatching(/\/heatmap\//),
                expect.any(Object)
            );
        });
    });

    it("displays generic initial status when starting the heatmap", async () => {
        fetchMock.mockImplementationOnce(() =>
            new Promise(resolve => setTimeout(() => resolve({
                ok: true,
                json: async () => mockHeatMapOptions
            } as Response), 20))
        );

        renderWithRouter(50);
        fireEvent.click(screen.getByRole("button", { name: /Heatmap/i }));

        await waitFor(() => {
            expect(screen.queryByText(/Starting heatmap…/i)).not.toBeInTheDocument();
        });
    });

    it("handles backend generation errors gracefully", async () => {
        fetchMock.mockImplementation((url: string) => {
            if (url.includes('/options')) {
                return Promise.resolve({ ok: true, json: async () => mockHeatMapOptions } as Response);
            }
            if (url.includes('/heatmap') && !url.includes('options')) {
                // The backend returns an RFC 9457 problem+json body; readApiError
                // reads it via response.text() and surfaces its `detail`.
                return Promise.resolve({
                    ok: false,
                    status: 400,
                    text: () =>
                        Promise.resolve(
                            JSON.stringify({
                                type: "/errors/invalid-grouping-column",
                                title: "Invalid grouping column",
                                detail: "API Fehler: Server-Validierung fehlgeschlagen",
                            }),
                        ),
                } as unknown as Response);
            }
            // Feed fields expected by the validation parser to prevent log noise
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    job_id: 'eb547f74-642d-41aa-91d2-7572c1e28516',
                    status: JobStatusValue.FAILED,
                    phase: JobPhase.HEATMAP,
                    progress_percent: 0,
                    current_step: "Failed",
                    steps_total: 1,
                    estimated_seconds_remaining: null
                })
            } as Response);
        });

        renderWithRouter(50);
        fireEvent.click(screen.getByRole("button", { name: /Heatmap/i }));

        await waitFor(() => {
            expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
        });

        fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
        const listbox = screen.getByRole("listbox");
        fireEvent.click(within(listbox).getByText("Sample_Group"));

        fireEvent.click(screen.getByRole("button", { name: /Generate Heatmap/i }));

        await waitFor(() => {
            expect(screen.getByText("API Error: Server validation failed")).toBeInTheDocument();
        });
    });

    it("blocks generation and displays warning when rowCount exceeds maximum threshold", async () => {
        renderWithRouter(600);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Heatmap/i }));
        });

        expect(screen.getByText(/exceeds the limit of 500/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Generate Heatmap/i })).toBeDisabled();
    });

    it("blocks generation and displays notice when rowCount is exactly zero", async () => {
        renderWithRouter(0);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Heatmap/i }));
        });

        expect(screen.getByText(/No CpGs match the current filter/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Generate Heatmap/i })).toBeDisabled();
    });

    it("verifies English help button accessibility descriptor", async () => {
        renderWithRouter(50);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Heatmap/i }));
        });

        expect(screen.getByRole("button", { name: "Open heatmap help" })).toBeInTheDocument();
    });
});
