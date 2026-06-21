import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { NormalizationPage } from "./NormalizationPage";

vi.mock("./hooks/useNormalizationPreview", () => ({
  useNormalizationPreview: () => ({
    data: {
      plots: [],
      recommendation: "noob",
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../analysis/hooks/useJobPolling.ts", () => ({
  useJobPolling: () => null,
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ job_id: "test-job" }),
  };
});

describe("NormalizationPage HelpButton", () => {
  it("renders the normalization help next to the method selection", () => {
    render(
      <MemoryRouter>
        <NormalizationPage />
      </MemoryRouter>,
    );

    const heading = screen.getByRole("heading", { name: "Normalisierungsmethode auswählen" });
    expect(heading.parentElement).toContainElement(
      screen.getByRole("button", { name: "Hilfe zur Normalisierung öffnen" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Hilfe zur Normalisierung öffnen" }));

    expect(screen.getByText(/Why is normalization necessary/i)).toBeInTheDocument();
    expect(screen.getByText(/For most studies, NOOB provides/i)).toBeInTheDocument();
  });
});
