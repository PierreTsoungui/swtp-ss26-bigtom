import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HelpButton from "./HelpButton";

describe("HelpButton", () => {
  it("opens the dialog and renders the topic's help content", () => {
    render(<HelpButton topic="upload" />);

    fireEvent.click(screen.getByRole("button", { name: "Hilfe öffnen" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText(/What files are required for the analysis/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hilfe schließen" })).toHaveFocus();
  });

  it("renders the topic title in the dialog header", () => {
    render(<HelpButton topic="normalization" />);

    fireEvent.click(screen.getByRole("button", { name: "Hilfe öffnen" }));

    expect(
      screen.getByRole("heading", { name: "Normalization" }),
    ).toBeInTheDocument();
  });

  it("renders Markdown structure (headings and lists), not plain text", () => {
    render(<HelpButton topic="filtering" />);

    fireEvent.click(screen.getByRole("button", { name: "Hilfe öffnen" }));

    expect(
      screen.getByRole("heading", { name: /Why is filtering necessary/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("list").length).toBeGreaterThan(0);
  });

  it("does not submit a surrounding form", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <HelpButton topic="upload" />
      </form>,
    );

    const helpButton = screen.getByRole("button", { name: "Hilfe öffnen" });
    expect(helpButton).toHaveAttribute("type", "button");

    fireEvent.click(helpButton);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes with Escape and restores focus to the trigger", () => {
    render(<HelpButton topic="upload" />);

    const helpButton = screen.getByRole("button", { name: "Hilfe öffnen" });
    fireEvent.click(helpButton);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(helpButton).toHaveFocus();
  });
});
