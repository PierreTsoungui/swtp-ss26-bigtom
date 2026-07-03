import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BatchForm } from "../components/BatchForm";

describe("BatchForm HelpButton Integration", () => {
  it("renders the batch help drawer without accidentally submitting the underlying form layout", () => {
    // Arrange
    const onSubmitMock = vi.fn();

    render(
      <BatchForm
        parameters={{
          job_id: "test-job",
          columns: [
            { name: "Sample_Plate", levels: 2, values: ["Plate_1", "Plate_2"] },
            { name: "Sample_Group", levels: 2, values: ["Cellline", "Coriell"] },
          ],
          available_columns: ["Sample_Plate", "Sample_Group"],
        }}
        onSubmit={onSubmitMock}
      />,
    );

    // Act - Click the help trigger button using the new English aria-label descriptor
    const helpButton = screen.getByRole("button", { name: "Open batch correction help" });
    fireEvent.click(helpButton);

    // Assert - Verify English markdown contents load up successfully onto the screen canvas
    expect(screen.getByText(/What are batch effects/i)).toBeInTheDocument();
    expect(screen.getByText(/Interpreting the SVD Heatmap/i)).toBeInTheDocument();
    
    // Ensure form execution remains untouched during help invocation
    expect(onSubmitMock).not.toHaveBeenCalled();
  });
});
