import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HelpButton from "../components/HelpButton";

describe("HelpButton", () => {
  it("opens the dialog and displays the configured help text", () => {
    render(
      <HelpButton
        helpText="Configured workflow help."
        ariaLabel="Hilfe zum Upload öffnen"
      />,
    );

    const helpButton = screen.getByRole("button", { name: "Hilfe zum Upload öffnen" });
    expect(helpButton.tagName).toBe("BUTTON");
    expect(helpButton).toHaveAttribute("aria-haspopup", "dialog");
    expect(helpButton).toHaveAttribute("aria-expanded", "false");

    helpButton.focus();
    expect(helpButton).toHaveFocus();

    fireEvent.click(helpButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(helpButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Configured workflow help.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hilfe schließen" })).toHaveFocus();
    expect(helpButton).not.toHaveAccessibleName("?");
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
    render(
      <HelpButton
        helpText="Keyboard help."
        ariaLabel="Hilfe zur Qualitätsfilterung öffnen"
      />,
    );

    const helpButton = screen.getByRole("button", {
      name: "Hilfe zur Qualitätsfilterung öffnen",
    });
    fireEvent.click(helpButton);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(helpButton).toHaveFocus();
  });
});
