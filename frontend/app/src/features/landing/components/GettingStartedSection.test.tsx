import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GettingStartedSection } from "./GettingStartedSection";
import type { InformationCard } from "../types";

const topics: InformationCard[] = [
  { title: "Topic One", description: "Explains one thing.", icon: <span data-testid="t1" /> },
  { title: "Topic Two", description: "Explains another thing.", icon: <span data-testid="t2" /> },
];

describe("GettingStartedSection", () => {
  it("renders the section heading", () => {
    render(<GettingStartedSection topics={topics} />);
    expect(
      screen.getByRole("heading", { name: "New to DNA methylation analysis?" }),
    ).toBeInTheDocument();
  });

  it("renders every topic with its heading, body and icon", () => {
    render(<GettingStartedSection topics={topics} />);

    expect(screen.getByRole("heading", { name: "Topic One" })).toBeInTheDocument();
    expect(screen.getByText("Explains another thing.")).toBeInTheDocument();
    expect(screen.getByTestId("t2")).toBeInTheDocument();
  });

  it("exposes the 'getting-started' anchor for header navigation", () => {
    const { container } = render(<GettingStartedSection topics={topics} />);
    expect(container.querySelector("#getting-started")).not.toBeNull();
  });
});
