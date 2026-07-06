import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { LandingPage } from "./LandingPage";
import { LANDING_SECTIONS } from "./sections";

// Helper to isolate LandingPage rendering inside a router provider context
function renderLandingPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe("LandingPage Component", () => {
  it("composes all landing sections in order", () => {
    renderLandingPage();

    expect(
      screen.getByRole("heading", { name: "DNA Methylation Analysis Platform" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "From raw files to interpretable results" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "New to DNA methylation analysis?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Frequently asked questions" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Biological & Technical Glossary" }),
    ).toBeInTheDocument();
  });

  it("routes the primary call to action to the upload flow", () => {
    renderLandingPage();

    const startLink = screen.getByRole("link", { name: /Start Analysis/i });
    expect(startLink).toHaveAttribute("href", "/upload");
  });

  // Regression guard: the header navigation (AppHeader) renders one anchor per
  // LANDING_SECTIONS entry, so every declared section id MUST exist as an
  // element on the page or the in-page navigation would scroll to nowhere.
  it("renders an element for every navigable section id", () => {
    const { container } = renderLandingPage();

    for (const section of LANDING_SECTIONS) {
      expect(
        container.querySelector(`#${section.id}`),
        `missing landing section element with id "${section.id}"`,
      ).not.toBeNull();
    }
  });

  it("renders representative content from each section", () => {
    renderLandingPage();

    // Workflow, getting-started, FAQ and glossary content is present.
    expect(screen.getAllByRole("heading", { name: "Select Files" }).length).toBeGreaterThan(0);
    expect(
      screen.getByText("What is a Sample Sheet and what information does it contain?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "DNA Methylation" })).toBeInTheDocument();
  });
});
