import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { FallbackPage } from "./FallbackPage";

function LocationDisplay() {
  const location = useLocation();

  return <p>Current path: {location.pathname}</p>;
}

function renderFallbackPage(variant: "not-found" | "error", initialEntries = ["/missing"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
      <Routes>
        <Route path="/previous" element={<p>Previous page</p>} />
        <Route
          path="*"
          element={
            <>
              <FallbackPage variant={variant} />
              <LocationDisplay />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FallbackPage", () => {
  it("renders the 404 title and description", () => {
    renderFallbackPage("not-found");

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(
      screen.getByText("The page you requested does not exist or may have been moved."),
    ).toBeInTheDocument();
  });

  it("renders the unexpected-error title and description", () => {
    renderFallbackPage("error");

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "An unexpected error occurred while displaying this page. Please try again or return to the start page.",
      ),
    ).toBeInTheDocument();
  });

  it("renders home and back buttons", () => {
    renderFallbackPage("not-found");

    expect(screen.getByRole("button", { name: "Go to start page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("navigates to the landing page from the home button", () => {
    renderFallbackPage("not-found");

    fireEvent.click(screen.getByRole("button", { name: "Go to start page" }));

    expect(screen.getByText("Current path: /")).toBeInTheDocument();
  });

  it("navigates backward from the back button", () => {
    renderFallbackPage("not-found", ["/previous", "/missing"]);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText("Previous page")).toBeInTheDocument();
  });
});
