import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { HeroSection } from "./HeroSection";

function renderHero() {
  return render(
    <MemoryRouter>
      <HeroSection />
    </MemoryRouter>,
  );
}

describe("HeroSection", () => {
  it("renders the platform title and introduction", () => {
    renderHero();

    expect(
      screen.getByRole("heading", { name: "DNA Methylation Analysis Platform" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/web-based platform for DNA methylation analysis/i),
    ).toBeInTheDocument();
  });

  it("links the primary call to action to the upload flow", () => {
    renderHero();

    const cta = screen.getByRole("link", { name: /Start Analysis/i });
    expect(cta).toHaveAttribute("href", "/upload");
  });

  it("renders the branding logo", () => {
    renderHero();

    expect(
      screen.getByRole("img", { name: /methylation analysis platform logo/i }),
    ).toBeInTheDocument();
  });

  it("exposes the 'overview' anchor for header navigation", () => {
    const { container } = renderHero();
    expect(container.querySelector("#overview")).not.toBeNull();
  });
});
