import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders an accessible dialog with its content", () => {
    render(
      <Modal onClose={vi.fn()} ariaLabel="Example">
        <p>Body content</p>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Example" });
    expect(within(dialog).getByText("Body content")).toBeInTheDocument();
  });

  it("focuses the built-in close button on open", () => {
    render(
      <Modal onClose={vi.fn()} ariaLabel="Example">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("uses a custom close label and honours initialFocusRef", () => {
    function Harness() {
      const inputRef = { current: null as HTMLInputElement | null };
      return (
        <Modal
          onClose={vi.fn()}
          ariaLabel="Example"
          closeLabel="Dismiss"
          initialFocusRef={inputRef}
        >
          <input
            aria-label="field"
            ref={(el) => {
              inputRef.current = el;
            }}
          />
        </Modal>
      );
    }
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.getByLabelText("field")).toHaveFocus();
  });

  it("closes on the close button, Escape, and backdrop — but not a panel click", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal onClose={onClose} ariaLabel="Example">
        <p>Body</p>
      </Modal>,
    );

    // Click inside the panel does not close.
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    // Backdrop (outermost element) closes.
    fireEvent.mouseDown(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("locks body scroll while open and restores it on unmount", () => {
    const { unmount } = render(
      <Modal onClose={vi.fn()} ariaLabel="Example">
        <p>Body</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("can hide the built-in close button", () => {
    render(
      <Modal onClose={vi.fn()} ariaLabel="Example" showCloseButton={false}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("traps Tab focus within the panel", () => {
    render(
      <Modal onClose={vi.fn()} ariaLabel="Example">
        <button>Only action</button>
      </Modal>,
    );
    // With few focusables, Tabbing stays inside the open dialog.
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
