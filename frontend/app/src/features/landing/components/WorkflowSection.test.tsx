import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowSection } from "./WorkflowSection";
import type { InformationCard } from "../types";

const steps: InformationCard[] = [
  { title: "First Step", description: "Do the first thing.", icon: <span data-testid="icon-1" /> },
  {
    title: "Second Step",
    description: "Do the second thing.",
    icon: <span data-testid="icon-2" />,
  },
];

describe("WorkflowSection", () => {
  it("renders the section heading and intro", () => {
    render(<WorkflowSection steps={steps} />);
    expect(
      screen.getByRole("heading", { name: "From raw files to interpretable results" }),
    ).toBeInTheDocument();
  });

  it("renders each step as an ordered list item with its content and icon", () => {
    render(<WorkflowSection steps={steps} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "First Step" })).toBeInTheDocument();
    expect(screen.getByText("Do the second thing.")).toBeInTheDocument();
    expect(screen.getByTestId("icon-1")).toBeInTheDocument();
  });

  it("numbers the steps with a zero-padded index", () => {
    render(<WorkflowSection steps={steps} />);
    const firstItem = screen.getByRole("heading", { name: "First Step" }).closest("li");
    expect(within(firstItem!).getByText("01")).toBeInTheDocument();
  });

  it("exposes the 'workflow' anchor for header navigation", () => {
    const { container } = render(<WorkflowSection steps={steps} />);
    expect(container.querySelector("#workflow")).not.toBeNull();
  });
});
