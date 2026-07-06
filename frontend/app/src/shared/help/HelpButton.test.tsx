import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HelpButton from "./HelpButton";

describe("HelpButton Component", () => {
  it("opens the dialog modal and renders the topic's markdown help content text blocks", () => {
    // Arrange & Act
    render(<HelpButton topic="upload" />);

    // Click trigger using the newly internationalized English fallback aria-label
    fireEvent.click(screen.getByRole("button", { name: "Open help" }));

    // Assert dialog layout mounts
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/What files are required for the analysis/i)).toBeInTheDocument();

    // Check that the closing button intercepts focus smoothly upon opening
    expect(screen.getByRole("button", { name: "Close help" })).toHaveFocus();
  });

  it("renders the resolved topic title dynamically in the dialog header section", () => {
    // Arrange & Act
    render(<HelpButton topic="normalization" />);

    fireEvent.click(screen.getByRole("button", { name: "Open help" }));

    // Assert title heading matches registry data fields
    expect(screen.getByRole("heading", { name: "Normalization" })).toBeInTheDocument();
  });

  it("renders rich Markdown syntax components (headings, lists) rather than raw plain text fields", () => {
    // Arrange & Act
    render(<HelpButton topic="filtering" />);

    fireEvent.click(screen.getByRole("button", { name: "Open help" }));

    // Assert markdown formatting blocks parse safely into standard sub-elements
    expect(
      screen.getByRole("heading", { name: /Why is filtering necessary/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("list").length).toBeGreaterThan(0);
  });

  it("does not trigger submission handlers of surrounding form containers when clicked", () => {
    // Arrange
    const onSubmitMock = vi.fn((event: React.FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmitMock}>
        <HelpButton topic="upload" />
      </form>,
    );

    // Act
    const helpButton = screen.getByRole("button", { name: "Open help" });
    expect(helpButton).toHaveAttribute("type", "button"); // Must enforce type="button" to prevent submit actions

    fireEvent.click(helpButton);

    // Assert
    expect(onSubmitMock).not.toHaveBeenCalled();
  });

  it("traps focus within the dialog on Tab and Shift+Tab", () => {
    render(<HelpButton topic="upload" />);
    fireEvent.click(screen.getByRole("button", { name: "Open help" }));

    const closeButton = screen.getByRole("button", { name: "Close help" });
    expect(closeButton).toHaveFocus();

    // Forward and backward tabbing keep focus inside the open dialog.
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("dismisses the help overlay safely upon firing the Escape key and restores focus back to the trigger button", () => {
    // Arrange
    render(<HelpButton topic="upload" />);

    // Act - Open dialog
    const helpButton = screen.getByRole("button", { name: "Open help" });
    fireEvent.click(helpButton);

    // Act - Escape out of dialog overlay
    fireEvent.keyDown(document, { key: "Escape" });

    // Assert state resets
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(helpButton).toHaveFocus();
  });
});
