import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppLayout } from "./AppLayout";

// Mock the downstream hook layer used inside layout side effects
vi.mock("../../features/analysis/hooks/useJobCancel", () => ({
  useJobCancel: (onCancelSuccess: () => void) => ({ // jobId: string,
    cancelJob: vi.fn(() => onCancelSuccess()),
    isLoading: false,
  }),
}));

function renderLayout(path = "/upload", resetAction?: ComponentProps<typeof AppLayout>["resetAction"]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout resetAction={resetAction}>
        <section>Test child content</section>
      </AppLayout>
    </MemoryRouter>,
  );
}

describe("AppLayout Component Shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders structural layout headers, footers, and generic children placeholders properly", () => {
    renderLayout();

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByText("Test child content")).toBeInTheDocument();
    expect(screen.getByText("© 2026 BigTom")).toBeInTheDocument();
  });

    it("displays the five chronological sequence indicator milestones inside step sub-navigations", () => {
    // Arrange & Act
    renderLayout("/analysis/job-123");

    expect(screen.getAllByText("Filter").length).toBeGreaterThan(0);

    // Target via the actual active aria-label string found in the DOM accessibility tree
    const stepIndicator = screen.getByRole("navigation", { name: "Schrittanzeige" });
    
    for (let step = 1; step <= 5; step += 1) {
      expect(within(stepIndicator).getByText(String(step))).toBeInTheDocument();
    }
    expect(within(stepIndicator).getByText("✓")).toBeInTheDocument();

    const currentStep = within(stepIndicator).getByText("2").closest("li");
    expect(currentStep).toHaveAttribute("aria-current", "step");
    expect(within(stepIndicator).queryByText("Aktuell")).not.toBeInTheDocument();
    expect(within(stepIndicator).getByText("Upload")).toBeInTheDocument();
    expect(within(stepIndicator).getByText("Filter")).toBeInTheDocument();
    expect(within(stepIndicator).getByText("Normalization")).toBeInTheDocument();
    expect(within(stepIndicator).getByText("Batch")).toBeInTheDocument();
    expect(within(stepIndicator).getByText("Results")).toBeInTheDocument();
  });


  it("updates header labels to display 'Privacy Policy' upon hitting the datenschutz page route", () => {
    renderLayout("/datenschutz");

    expect(within(screen.getByRole("banner")).getByText("Privacy Policy")).toBeInTheDocument();
  });

  it("falls back gracefully onto generic application headers if navigation lands on unmapped parameters", () => {
    renderLayout("/unknown-route");

    const header = screen.getByRole("banner");
    expect(within(header).queryByText("Privacy Policy")).not.toBeInTheDocument();
    expect(within(header).getAllByText("MethylAnalyzer")).toHaveLength(1);
  });

  it("safely routes external regulatory footer links targeted at the official university imprint portal", () => {
    renderLayout();

    const impressum = screen.getByRole("link", { name: "Imprint" });
    expect(impressum).toHaveAttribute("href", "https://www.thm.de/site/impressum.html");
    expect(impressum).toHaveAttribute("target", "_blank");
    expect(impressum.getAttribute("rel")).toContain("noopener");
    expect(impressum.getAttribute("rel")).toContain("noreferrer");

    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/datenschutz");
  });

  it("renders scaled-down minimal identity headers without action tools inside landing entries", () => {
    renderLayout("/");

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: /methylanalyzer/i })).toHaveAttribute("href", "/");
    expect(within(header).queryByRole("navigation", { name: /step indicator/i })).not.toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("keeps form reset triggers disabled if no continuous active analysis background tasks are identified", () => {
    renderLayout("/upload");

    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("unlocks reset triggers on busy sessions and correctly delegates action dispatches back to parent handlers", () => {
    const onResetMock = vi.fn();
    renderLayout("/analysis/job-123", {
      isAnalysisActive: true,
      onReset: onResetMock,
    });

    const resetButton = screen.getByRole("button", { name: "Reset" });
    expect(resetButton).toBeEnabled();

    fireEvent.click(resetButton);
    expect(onResetMock).toHaveBeenCalledTimes(1);
  });
});
