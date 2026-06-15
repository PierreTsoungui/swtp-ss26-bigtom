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
  it("rendert die Landing Page unter der Root-Route", () => {
    renderApp("/");

    expect(
      screen.getByRole("heading", { name: "DNA Methylation Analysis Platform" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start Analysis" })).toHaveAttribute(
      "href",
      "/upload",
    );
    expect(
      screen.getByRole("img", {
        name: "BigTom DNA methylation analysis platform logo",
      }),
    ).toBeInTheDocument();
  });

  it("zeigt Workflow, Onboarding und FAQ", () => {
    renderApp("/");

    expect(
      screen.getByRole("heading", { name: "From raw files to interpretable results" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "New to DNA methylation analysis?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Frequently asked questions" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Select Files" })).toBeInTheDocument();
    expect(screen.getByText("What does the PCA plot show?")).toBeInTheDocument();
  });

  it("lässt die bestehende Upload-Route erreichbar", () => {
    renderApp("/upload");

    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { name: "Upload" })).toBeInTheDocument();
  });
});
