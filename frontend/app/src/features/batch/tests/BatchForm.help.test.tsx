import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BatchForm } from "../components/BatchForm";

describe("BatchForm HelpButton", () => {
  it("renders the batch help without submitting the form", () => {
    const onSubmit = vi.fn();

    render(
      <BatchForm
        parameters={{
          job_id: "test-job",
          available_columns: ["Sample_Plate", "Sample_Group"],
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hilfe zur Batch-Korrektur öffnen" }));

    expect(screen.getByText(/What are batch effects/i)).toBeInTheDocument();
    expect(screen.getByText(/Interpreting the SVD Heatmap/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
