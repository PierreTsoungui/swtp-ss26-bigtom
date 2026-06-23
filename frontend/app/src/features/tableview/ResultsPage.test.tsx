import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultsPage } from "./ResultsPage";

vi.mock("./components/TableContainer.tsx", () => ({
  TableContainer: () => <div data-testid="table-container">Results table</div>,
}));

describe("ResultsPage HelpButton", () => {
  it("renders the table/export help without replacing the result table", () => {
    render(<ResultsPage />);

    expect(screen.getByTestId("table-container")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Hilfe zur Ergebnistabelle und zum CSV-Export öffnen",
      }),
    );

    expect(screen.getByText(/All result tables can be exported as CSV files/i)).toBeInTheDocument();
    expect(screen.getByText(/exported files always contain the complete dataset/i)).toBeInTheDocument();
    expect(screen.getByTestId("table-container")).toBeInTheDocument();
  });
});
