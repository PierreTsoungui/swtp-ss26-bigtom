import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import App from "./App";

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routing", () => {
  it("renders the 404 fallback for unknown routes", () => {
    renderApp("/unknown-route");

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to start page" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Step indicator" })).not.toBeInTheDocument();
  });

  it("keeps valid routes reachable", () => {
    renderApp("/");

    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { name: "DNA Methylation Analysis Platform" }),
    ).toBeInTheDocument();
  });

  it("keeps the workflow step indicator on valid workflow routes", () => {
    renderApp("/upload");

    expect(
        screen.getByRole("navigation", { name: /step indicator/i }),
    ).toBeInTheDocument();
  });
});
