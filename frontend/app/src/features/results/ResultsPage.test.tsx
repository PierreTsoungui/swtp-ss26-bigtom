import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultsPage } from "./ResultsPage";

// Mock the nested TableContainer component to isolate ResultsPage layout testing
vi.mock("./components/table/TableContainer.tsx", () => ({
  TableContainer: () => <div data-testid="table-container">Results table</div>,
}));

describe("ResultsPage HelpButton Integration", () => {
  it("renders the page layout and toggles table/export help safely without replacing the result table layout", () => {
    // Arrange
    render(<ResultsPage />);

    // Assert main header and mocked table are present in view
    expect(screen.getByRole("heading", { name: /Table View & Data Export/i })).toBeInTheDocument();
    expect(screen.getByTestId("table-container")).toBeInTheDocument();

    // Act - Click the help button using the new English aria-label descriptor
    const helpButton = screen.getByRole("button", {
      name: "Open help for result table and CSV export",
    });
    fireEvent.click(helpButton);

    // Assert English contextual markdown help content gets correctly mounted onto the document context
    expect(screen.getByText(/All result tables can be exported as CSV files/i)).toBeInTheDocument();
    expect(
      screen.getByText(/exported files always contain the complete dataset/i),
    ).toBeInTheDocument();

    // Ensure the results container layout remains safely unaffected and persistent during help toggling
    expect(screen.getByTestId("table-container")).toBeInTheDocument();
  });
});
