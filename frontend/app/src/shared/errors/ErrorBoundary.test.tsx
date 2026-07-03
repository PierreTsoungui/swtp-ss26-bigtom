import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "../layout/AppLayout";
import { ErrorBoundary } from "./ErrorBoundary";

function ThrowingComponent(): ReactElement {
  throw new Error("Test error");
}

function ErrorBoundaryLayoutHarness() {
  const [hasFrontendError, setHasFrontendError] = useState(false);

  return (
    <AppLayout hideStepIndicator={hasFrontendError}>
      <ErrorBoundary onErrorStateChange={setHasFrontendError}>
        <Routes>
          <Route path="/analysis/:job_id" element={<ThrowingComponent />} />
        </Routes>
      </ErrorBoundary>
    </AppLayout>
  );
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("catches rendering errors and displays the non-technical fallback", () => {
    render(
      <MemoryRouter initialEntries={["/crash"]}>
        <ErrorBoundary>
          <Routes>
            <Route path="/crash" element={<ThrowingComponent />} />
          </Routes>
        </ErrorBoundary>
      </MemoryRouter>,
      {
        onCaughtError: () => {},
        onRecoverableError: () => {},
      },
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.queryByText("Test error")).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });

  it("allows the user to return to the landing page", () => {
    render(
      <MemoryRouter initialEntries={["/crash"]}>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<h1>Start page</h1>} />
            <Route path="/crash" element={<ThrowingComponent />} />
          </Routes>
        </ErrorBoundary>
      </MemoryRouter>,
      {
        onCaughtError: () => {},
        onRecoverableError: () => {},
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Go to start page" }));

    expect(screen.getByRole("heading", { name: "Start page" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Something went wrong" })).not.toBeInTheDocument();
  });

  it("hides the workflow step indicator when the layout displays the error fallback", () => {
    render(
      <MemoryRouter initialEntries={["/analysis/test-job"]}>
        <ErrorBoundaryLayoutHarness />
      </MemoryRouter>,
      {
        onCaughtError: () => {},
        onRecoverableError: () => {},
      },
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("MethylAnalyzer");
    expect(screen.queryByRole("navigation", { name: "Schrittanzeige" })).not.toBeInTheDocument();
  });
});
