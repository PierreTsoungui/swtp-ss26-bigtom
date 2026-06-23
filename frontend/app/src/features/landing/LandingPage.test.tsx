import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import App from "../../App";

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("LandingPage", () => {

  it("zeigt die Projektbeschreibung", () => {
    renderApp("/");

    expect(
      screen.getByText(/web-based platform for DNA methylation analysis/i),
    ).toBeInTheDocument();

    // Mis à jour conformément aux corrections linguistiques du ticket #3949
    expect(
      screen.getByText(/minimizing the need for extensive programming or bioinformatics expertise/i),
    ).toBeInTheDocument();
  });

  it("renders landing page on root route", () => {
    renderApp("/");

    expect(
      screen.getByRole("heading", {
        name: "DNA Methylation Analysis Platform",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "Start Analysis" }),
    ).toHaveAttribute("href", "/upload");

    expect(
      screen.getByText(/Full methylation analysis/i),
    ).toBeInTheDocument();
  });

  it("zeigt Workflow Sektion korrekt", () => {
    renderApp("/");

    expect(
      screen.getByRole("heading", {
        name: "From raw files to interpretable results",
      }),
    ).toBeInTheDocument();

    const workflowSteps = [
      "Select Files",
      "Initial Filtering",
      "Normalization",
      "Optional Batch Correction",
      "Results",
    ];

    workflowSteps.forEach((step) => {
      const headings = screen.getAllByRole("heading", { name: step });
      expect(headings[0]).toBeInTheDocument();
    });
  });

  it("zeigt Beginner Section", () => {
    renderApp("/");

    expect(
      screen.getByRole("heading", {
        name: "New to DNA methylation analysis?",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/DNA methylation analysis involves several processing steps/i),
    ).toBeInTheDocument();
  });

  it("zeigt FAQ Kategorien", () => {
    renderApp("/");

    const categories = [
      "Upload & Files",
      "Analysis Process",
      "Results & Tables",
      "Visualizations",
      "Data Privacy & Security",
    ];

    categories.forEach((cat) => {
      expect(
        screen.getByRole("heading", { name: cat }),
      ).toBeInTheDocument();
    });
  });

  it("zeigt FAQ Fragen", () => {
    renderApp("/");

    expect(
      screen.getByText("What is a Sample Sheet and what information does it contain?"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("What is normalization and why is it necessary?"),
    ).toBeInTheDocument();

    // Espace fautif supprimé conformément à la correction typographique
    expect(
      screen.getByText("What is a DMP?"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("What does the PCA plot show?"),
    ).toBeInTheDocument();
  });

      //EXTENSION : SURVEILLANCE DU GLOSSAIRE

  it("zeigt das biologische Glossar korrekt", () => {
    renderApp("/");

    expect(
      screen.getByRole("heading", {
        name: "Biological & Technical Glossary",
      }),
    ).toBeInTheDocument();

    // Vérification que les termes du dictionnaire interne s'affichent
    expect(screen.getByText("detP (Detection p-value)")).toBeInTheDocument();
    expect(screen.getByText("CpG Site")).toBeInTheDocument();
    expect(screen.getByText("Batch Effect")).toBeInTheDocument();
  });

  it("upload route bleibt erreichbar", () => {
    renderApp("/upload");

    const main = screen.getByRole("main");

    expect(
      within(main).getByRole("heading", { name: "Upload" }),
    ).toBeInTheDocument();
  });
});
