import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./LandingPage";

// Helper to isolate LandingPage rendering inside a router provider context
function renderLandingPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <LandingPage />
    </MemoryRouter>
  );
}

describe("LandingPage Component", () => {
  it("displays the correct project title and descriptive introduction text blocks", () => {
    // Arrange & Act
    renderLandingPage();

    // Assert main headline
    expect(
      screen.getByRole("heading", { name: "DNA Methylation Analysis Platform" })
    ).toBeInTheDocument();

    // Assert platform details
    expect(
      screen.getByText(/web-based platform for DNA methylation analysis/i)
    ).toBeInTheDocument();

    expect(
      screen.getByText(/minimizing the need for extensive programming or bioinformatics expertise/i)
    ).toBeInTheDocument();
  });

  it("contains an active, correctly targeted redirection link to push users towards the upload interface", () => {
    // Arrange & Act
    renderLandingPage();

    // Assert link element attributes
    const startLink = screen.getByRole("link", { name: /Start Analysis/i });
    expect(startLink).toBeInTheDocument();
    expect(startLink).toHaveAttribute("href", "/upload");
  });

    it("renders the automated analysis workflow stages section with matching list structures", () => {
    // Arrange & Act
    renderLandingPage();

    // Assert workflow section intro
    expect(
      screen.getByRole("heading", { name: "From raw files to interpretable results" })
    ).toBeInTheDocument();

    const expectedWorkflowSteps = [
      "Select Files",
      "Initial Filtering",
      "Normalization",
      "Optional Batch Correction",
      "Results"
    ];

    // Verify each workflow card title is safely displayed (using getAllByRole to avoid duplication errors)
    expectedWorkflowSteps.forEach((step) => {
      const headings = screen.getAllByRole("heading", { name: step });
      expect(headings.length).toBeGreaterThan(0);
      expect(headings[0]).toBeInTheDocument();
    });
  });


  it("displays the introductory guidance section targeted at newcomers or beginners", () => {
    // Arrange & Act
    renderLandingPage();

    expect(
      screen.getByRole("heading", { name: "New to DNA methylation analysis?" })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/DNA methylation analysis involves several processing steps/i)
    ).toBeInTheDocument();
  });

  it("presents structured FAQ category containers grouped by contextual themes", () => {
    // Arrange & Act
    renderLandingPage();

    const expectedFaqCategories = [
      "Upload & Files",
      "Analysis Process",
      "Results & Tables",
      "Visualizations",
      "Data Privacy & Security"
    ];

    expectedFaqCategories.forEach((category) => {
      expect(screen.getByRole("heading", { name: category })).toBeInTheDocument();
    });
  });

  it("renders critical FAQ specific query prompts within the drop-down accordion lists", () => {
    // Arrange & Act
    renderLandingPage();

    expect(
      screen.getByText("What is a Sample Sheet and what information does it contain?")
    ).toBeInTheDocument();

    expect(
      screen.getByText("What is normalization and why is it necessary?")
    ).toBeInTheDocument();

    expect(
      screen.getByText("What is a DMP?")
    ).toBeInTheDocument();

    expect(
      screen.getByText("What does the PCA plot show?")
    ).toBeInTheDocument();
  });

  it("mounts the biological and technical knowledge base glossary with expected terms", () => {
    // Arrange & Act
    renderLandingPage();

    expect(
      screen.getByRole("heading", { name: "Biological & Technical Glossary" })
    ).toBeInTheDocument();

    // Validate a selection of key dictionary definitions
    expect(screen.getByRole("heading", { name: "DNA Methylation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "CpG Site" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Batch Effect" })).toBeInTheDocument();
  });
});
