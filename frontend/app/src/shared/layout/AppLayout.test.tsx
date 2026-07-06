import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppLayout } from "./AppLayout";

// Mock the downstream hook layer used inside layout side effects
vi.mock("../../features/analysis/hooks/useJobCancel", () => ({
  useJobCancel: (onCancelSuccess: () => void) => ({
    // jobId: string,
    cancelJob: vi.fn(() => onCancelSuccess()),
    isLoading: false,
  }),
}));

function renderLayout(
  path = "/upload",
  resetAction?: ComponentProps<typeof AppLayout>["resetAction"],
  landingSections?: ComponentProps<typeof AppLayout>["landingSections"],
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout resetAction={resetAction} landingSections={landingSections}>
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

    // On /analysis, step 2 (Filter) is current: step 1 is completed and shows a
    // check mark (not its number), while the current and pending steps 2-5 show
    // their number. Rendering a single glyph keeps it centered.
    expect(within(stepIndicator).queryByText("1")).not.toBeInTheDocument();
    expect(within(stepIndicator).getByText("✓")).toBeInTheDocument();
    for (let step = 2; step <= 5; step += 1) {
      expect(within(stepIndicator).getByText(String(step))).toBeInTheDocument();
    }

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
    renderLayout("/privacy");

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

    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  it("renders scaled-down minimal identity headers without action tools inside landing entries", () => {
    renderLayout("/");

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: /methylanalyzer/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      within(header).queryByRole("navigation", { name: /step indicator/i }),
    ).not.toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("renders the injected in-page sections as landing header navigation anchors", () => {
    // The shell is feature-agnostic: it renders whatever sections it is given.
    const sections = [
      { id: "overview", label: "Overview" },
      { id: "workflow", label: "Workflow" },
      { id: "getting-started", label: "Getting Started" },
    ];
    renderLayout("/", undefined, sections);

    const sectionNav = within(screen.getByRole("banner")).getByRole("navigation", {
      name: /landing page sections/i,
    });

    for (const { id, label } of sections) {
      expect(within(sectionNav).getByRole("link", { name: label })).toHaveAttribute(
        "href",
        `#${id}`,
      );
    }
  });

  it("does not render the landing section navigation on non-landing routes", () => {
    renderLayout("/upload");

    expect(
      screen.queryByRole("navigation", { name: /landing page sections/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps form reset triggers disabled if no continuous active analysis background tasks are identified", () => {
    renderLayout("/upload");

    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("enables the reset action on the results page so data can be deleted after the analysis finished", () => {
    // Regression: reset must be reachable on /results (GDPR right to erasure),
    // not only while an analysis is running on /analysis or /normalization.
    renderLayout("/results/job-123");

    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
  });

  it("confirms before delegating a reset: opens the dialog, and only the Delete action fires onReset", () => {
    const onResetMock = vi.fn();
    renderLayout("/analysis/job-123", {
      isAnalysisActive: true,
      onReset: onResetMock,
    });

    const resetButton = screen.getByRole("button", { name: "Reset" });
    expect(resetButton).toBeEnabled();

    // Clicking Reset must NOT delete immediately — it opens a confirmation.
    fireEvent.click(resetButton);
    expect(onResetMock).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete this analysis?")).toBeInTheDocument();

    // Only confirming the destructive action delegates to the parent handler.
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onResetMock).toHaveBeenCalledTimes(1);
  });

  it("cancelling the reset confirmation does not delete anything", () => {
    const onResetMock = vi.fn();
    renderLayout("/analysis/job-123", {
      isAnalysisActive: true,
      onReset: onResetMock,
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(onResetMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
