import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import InfoPanel from "./InfoPanel";

describe("InfoPanel", () => {
  it("renders the title and message", () => {
    render(<InfoPanel title="Preparing Analysis" message="Please wait..." />);

    expect(screen.getByRole("heading", { name: "Preparing Analysis" })).toBeInTheDocument();
    expect(screen.getByText("Please wait...")).toBeInTheDocument();
  });

  it("associates the region with its heading for accessibility", () => {
    render(<InfoPanel title="Analysis Not Available" message="No job id." />);

    // The region is labelled by its heading (aria-labelledby -> the h1 id).
    const region = screen.getByRole("region", { name: "Analysis Not Available" });
    expect(region).toBeInTheDocument();
  });

  it("gives each panel a unique heading id", () => {
    render(
      <>
        <InfoPanel title="First" message="a" />
        <InfoPanel title="Second" message="b" />
      </>,
    );

    const first = screen.getByRole("heading", { name: "First" });
    const second = screen.getByRole("heading", { name: "Second" });
    expect(first.id).not.toBe("");
    expect(first.id).not.toBe(second.id);
  });
});
