import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";

function renderLayout(path = "/upload", resetAction?: ComponentProps<typeof AppLayout>["resetAction"]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout resetAction={resetAction}>
        <section>Test child content</section>
      </AppLayout>
    </MemoryRouter>,
  );
}

describe("AppLayout", () => {
  it("rendert Header, Footer und children", () => {
    renderLayout();

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByText("Test child content")).toBeInTheDocument();
    expect(screen.getByText("BigTom")).toBeInTheDocument();
  });

  it("zeigt die aktuelle Phase und die Schritte 1 bis 7", () => {
    renderLayout("/analysis/job-123");

    expect(screen.getAllByText("Analysis").length).toBeGreaterThan(0);

    const stepIndicator = screen.getByRole("navigation", { name: /schrittanzeige/i });
    for (let step = 1; step <= 7; step += 1) {
      expect(within(stepIndicator).getByText(String(step))).toBeInTheDocument();
    }

    expect(within(stepIndicator).getByText("3")).toHaveAttribute("aria-current", "step");
  });

  it("zeigt Datenschutz nur auf der Datenschutz-Seite als aktuelle Phase", () => {
    renderLayout("/datenschutz");

    expect(within(screen.getByRole("banner")).getByText("Datenschutz")).toBeInTheDocument();
  });

  it("verwendet BigTom als Phase fuer unbekannte Routen", () => {
    renderLayout("/unbekannt");

    const header = screen.getByRole("banner");
    expect(within(header).queryByText("Datenschutz")).not.toBeInTheDocument();
    expect(within(header).getAllByText("BigTom")).toHaveLength(2);
  });

  it("rendert die Footer-Links korrekt", () => {
    renderLayout();

    const impressum = screen.getByRole("link", { name: "Impressum" });
    expect(impressum).toHaveAttribute("href", "https://www.thm.de/site/impressum.html");
    expect(impressum).toHaveAttribute("target", "_blank");
    expect(impressum.getAttribute("rel")).toContain("noopener");
    expect(impressum.getAttribute("rel")).toContain("noreferrer");

    expect(screen.getByRole("link", { name: "Datenschutz" })).toHaveAttribute(
      "href",
      "/datenschutz",
    );
  });

  it("deaktiviert den Reset-Button, wenn keine Analyse aktiv ist", () => {
    renderLayout("/upload");

    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("aktiviert den Reset-Button bei aktiver Analyse und ruft den frontend reset auf", () => {
    const onReset = vi.fn();
    renderLayout("/analysis/job-123", {
      isAnalysisActive: true,
      onReset,
    });

    const resetButton = screen.getByRole("button", { name: "Reset" });
    expect(resetButton).toBeEnabled();

    fireEvent.click(resetButton);

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
