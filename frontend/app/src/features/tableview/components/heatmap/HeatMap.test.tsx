import {fireEvent, screen, render, waitFor} from "@testing-library/react";
import HeatMap from "./HeatMap.tsx";


const mockHeatMapOptions = {
    job_id: "swtp-ss26-bigtom-xyz",
    available_columns: [
        "Sample_Group",
        "Gender",
        "Treatment",
        "Disease_Stage",
        "Age_Group",
        "Batch",
        "Cell_Type",
    ],
};

const mockHeatMapResponse = {
    job_id: "swtp-ss26-bigtom-xyz",
    phase: "downstream_analysis",
    status: "success",
    heatmap_metadata: {
        detected_cpgs: 14,
        plotted_samples: 48,
        message:
            "Heatmap erfolgreich generiert. PNG kann abgerufen werden.",
    },
};

const mockHeatMapError = {
    error: "VALIDATION_FAILED",
    message:
        "Zu viele CpGs für die ausgewählte Region! Maximal 20 CpGs erlaubt.",
    details: {
        current_count: 42,
        max_allowed: 20,
    },
};

const mockPngBlob = new Blob(["fake-png-binary-data"], {
    type: "image/png",
});

const mockDmpFilter = {
    dmp_filter: {
        dmr_id: "DMR_104_GenX",
        chromosome: "chr19",
        start: 54200000,
        stop: 54215000,
        p_value_max: 0.05,
        adj_p_value_max: 0.01,
        delta_beta_min: -0.2,
        delta_beta_max: 0.5,
    },
    grouping: {
        primary: "Sample_Group",
        secondary: "Gender",
    },
};

beforeEach(() => {
    global.fetch = vi.fn((url: string) => {
        if (url.includes("/options")) {
            return Promise.resolve({
                ok: true,
                json: async () => mockHeatMapOptions,
            } as Response);
        }

        if (url.includes("/heatmap") && !url.includes("options")) {
            return Promise.resolve({
                ok: true,
                json: async () => mockHeatMapResponse,
            } as Response);
        }

        if (url.includes("/png") || url.includes("heatmap")) {
            return Promise.resolve({
                ok: true,
                blob: async () => mockPngBlob,
            } as Response);
        }

        return Promise.reject(new Error("Unknown endpoint"));
    }) as any;
});

afterEach(() => {
    vi.clearAllMocks();
});
/*
    TEST:
    - Rendern der Komponente
    - Laden der verfügbaren Spalten für die Gruppierung (mocked API call)
    - Auswahl von Gruppierungsspalten und Generieren der Heatmap (mocked API call)
        - Erste Dropdown Pflichtfeld prüfen, dass es nicht leer sein kann
        - Zweite Dropdown Pflichtfeld prüfen, dass es nicht den gleichen Wert wie die erste und auch nicht mehr als 1
            - Prüfen, dass Zweite Dropdown auch leer sein kann
    - Erfolgreiches Abrufen der generierten Heatmap als PNG (mocked API call)
    - Anzeige von Ladezuständen während der API-Aufrufe
    - Fehlerbehandlung bei ungültigen Eingaben oder API-Fehlern
 */
describe('HeatMap', () => {
    it("renders correctly", () => {
        const { container } = render(<HeatMap />);
        expect(container).toMatchSnapshot();


    })

    it("loads grouping options", async () => {
        render(<HeatMap />);

        // Accordion öffnen
        fireEvent.click(screen.getByText("Heatmap"));

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining("/options"),
            );
        });

        expect(screen.getByText("Heatmap")).toBeInTheDocument();
    });

    it("allows selecting primary grouping and prevents invalid secondary selection", async () => {
        render(<HeatMap />);

        // warten bis Optionen geladen
        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining("/options"),
            ),
        );

        const primarySelect = screen.getAllByRole("combobox")[0];

        fireEvent.mouseDown(primarySelect);

        await waitFor(() => {
            expect(screen.getByText("Sample_Group")).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText("Sample_Group"));

        // Secondary sollte andere Werte enthalten
        const secondarySelect = screen.getAllByRole("combobox")[1];

        fireEvent.mouseDown(secondarySelect);

        expect(
            screen.queryByText("Sample_Group"),
        ).not.toBeInTheDocument();
    });

    it("generates heatmap successfully", async () => {
        render(<HeatMap />);

        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining("/options"),
            ),
        );

        const buttons = screen.getAllByRole("button");

        const generateBtn = buttons.find((b) =>
            b.textContent?.includes("Heatmap"),
        );

        fireEvent.click(generateBtn!);

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining("/heatmap"),
                expect.objectContaining({
                    method: "POST",
                }),
            );
        });
    });

    it("shows loading state during generation", async () => {
        render(<HeatMap />);

        const buttons = screen.getAllByRole("button");

        const generateBtn = buttons.find((b) =>
            b.textContent?.includes("Heatmap"),
        );

        fireEvent.click(generateBtn!);

        expect(
            await screen.findByText(/generiert/i),
        ).toBeInTheDocument();
    });

    it("displays heatmap after successful generation", async () => {
        render(<HeatMap />);

        const generateBtn = screen
            .getAllByRole("button")
            .find((b) => b.textContent?.includes("Heatmap"))!;

        fireEvent.click(generateBtn);

        await waitFor(() => {
            expect(
                screen.getByText(/Heatmap erfolgreich|PNG/i),
            ).toBeInTheDocument();
        });
    });

    it("shows error message on API failure", async () => {
        global.fetch = vi.fn(() =>
            Promise.resolve({
                ok: false,
                json: async () => mockHeatMapError,
            } as Response),
        ) as any;

        render(<HeatMap />);

        const generateBtn = screen
            .getAllByRole("button")
            .find((b) => b.textContent?.includes("Heatmap"))!;

        fireEvent.click(generateBtn);

        expect(
            await screen.findByText(/Maximal 20 CpGs/i),
        ).toBeInTheDocument();
    });

    it("downloads PNG after generation", async () => {
        const createObjectURLMock = vi.fn(() => "blob:url");

        global.URL.createObjectURL = createObjectURLMock as any;
        global.URL.revokeObjectURL = vi.fn();

        render(<HeatMap />);

        const generateBtn = screen
            .getAllByRole("button")
            .find((b) => b.textContent?.includes("Heatmap"))!;

        fireEvent.click(generateBtn);

        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining("/heatmap"),
            ),
        );

        const downloadBtn = await screen.findByText(/Download/i);

        fireEvent.click(downloadBtn);

        expect(createObjectURLMock).toHaveBeenCalled();
    });
})