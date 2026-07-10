import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LoadingScreen from "./LoadingScreen";

describe("LoadingScreen", () => {
  it("renders the provided message with neutral styling by default", () => {
    render(<LoadingScreen message="Loading previews..." />);

    const message = screen.getByText("Loading previews...");
    expect(message).toBeInTheDocument();
    expect(message).toHaveClass("text-neutral-textSecondary");
  });

  it("applies error styling when isError is set", () => {
    render(<LoadingScreen message="Something failed" isError />);

    const message = screen.getByText("Something failed");
    expect(message).toHaveClass("text-danger");
  });
});
