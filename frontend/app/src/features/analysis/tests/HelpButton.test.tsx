import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HelpButton from "../components/HelpButton";

describe("HelpButton", () => {
  it("opens the dialog and displays the configured help text", () => {
    render(<HelpButton helpText="Configured workflow help." />);

    fireEvent.click(screen.getByRole("button", { name: "Hilfe öffnen" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Configured workflow help.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schließen" })).toHaveFocus();
  });

  it("does not submit a surrounding form", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <HelpButton helpText="Form help." />
      </form>,
    );

    const helpButton = screen.getByRole("button", { name: "Hilfe öffnen" });
    expect(helpButton).toHaveAttribute("type", "button");

    fireEvent.click(helpButton);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes with Escape and restores focus to the trigger", () => {
    render(<HelpButton helpText="Keyboard help." />);

    const helpButton = screen.getByRole("button", { name: "Hilfe öffnen" });
    fireEvent.click(helpButton);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(helpButton).toHaveFocus();
  });
});
