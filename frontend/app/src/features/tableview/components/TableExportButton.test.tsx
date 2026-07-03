import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TableExportButton } from "./TableExportButton";

describe("TableExportButton", () => {
  it("renders the export button with correct English text", () => {
    // Arrange & Act
    render(<TableExportButton onDownload={vi.fn()} />);

    // Assert
    expect(screen.getByRole("button", { name: /Download CSV/i })).toBeInTheDocument();
  });

  it("triggers the onDownload callback exactly once when clicked", () => {
    // Arrange
    const onDownloadMock = vi.fn();
    render(<TableExportButton onDownload={onDownloadMock} />);

    // Act
    const button = screen.getByRole("button", { name: /Download CSV/i });
    fireEvent.click(button);

    // Assert
    expect(onDownloadMock).toHaveBeenCalledTimes(1);
  });
});
