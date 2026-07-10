import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ErrorMessage from "./ErrorMessage";
import type { ProblemDetail } from "./ErrorTypes";

const origin = { vertical: "top", horizontal: "center" } as const;

describe("ErrorMessage", () => {
  it("renders nothing visible when closed", () => {
    render(<ErrorMessage open={false} error="hidden" onClose={vi.fn()} {...origin} />);
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("renders a plain string error", () => {
    render(<ErrorMessage open error="Something broke" onClose={vi.fn()} {...origin} />);
    expect(screen.getByText("Something broke")).toBeInTheDocument();
  });

  it("formats a ProblemDetail as 'title: detail'", () => {
    const problem: ProblemDetail = {
      title: "Invalid input",
      status: 400,
      detail: "Missing column",
      instance: "/x",
    };
    render(<ErrorMessage open error={problem} onClose={vi.fn()} {...origin} />);
    expect(screen.getByText("Invalid input: Missing column")).toBeInTheDocument();
  });

  it("renders an Error object's message", () => {
    render(<ErrorMessage open error={new Error("Boom")} onClose={vi.fn()} {...origin} />);
    expect(screen.getByText("Boom")).toBeInTheDocument();
  });

  it("falls back to 'Unknown error' for a null error", () => {
    render(<ErrorMessage open error={null} onClose={vi.fn()} {...origin} />);
    expect(screen.getByText("Unknown error")).toBeInTheDocument();
  });

  it("invokes onClose from the alert's close affordance", () => {
    const onClose = vi.fn();
    render(<ErrorMessage open error="x" onClose={onClose} {...origin} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
