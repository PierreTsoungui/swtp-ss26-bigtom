import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BatchForm } from "../components/BatchForm";

// Mock the nested SampleSheetPreviewModal to decouple layout testing
vi.mock("../components/SampleSheetPreviewModal.tsx", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="mock-preview-modal">
      <span>Sample Sheet Preview Overlay</span>
      <button onClick={onClose}>Close Preview</button>
    </div>
  ),
}));

const mockParameters = {
  job_id: "batch-uuid-999",
  available_columns: ["Sentrix_ID", "Sample_Group", "Age"],
  columns: [
    { name: "Sentrix_ID", levels: 4, values: ["ID1", "ID2", "ID3", "ID4"] },
    { name: "Sample_Group", levels: 2, values: ["Cancer", "Control"] },
    { name: "Age", levels: 3, values: ["Young", "Middle", "Old"] },
  ],
};

describe("BatchForm Component Suite", () => {
  const onSubmitMock = vi.fn();
  const onSkipMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {}); // Intercept local window alerts
  });

  it("renders headers, input fields, and action buttons cleanly with structural English texts", () => {
    render(<BatchForm parameters={mockParameters} onSubmit={onSubmitMock} onSkip={onSkipMock} />);

    expect(screen.getByRole("heading", { name: "Batch Analysis & Correction" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open batch correction help" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview sample sheet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Batch" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Proceed to analysis" })).toBeEnabled();
  });

  it("toggles the Sample Sheet interactive preview overlay modal on and off smoothly", () => {
    render(<BatchForm parameters={mockParameters} onSubmit={onSubmitMock} onSkip={onSkipMock} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview sample sheet" }));
    expect(screen.getByTestId("mock-preview-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close Preview" }));
    expect(screen.queryByTestId("mock-preview-modal")).not.toBeInTheDocument();
  });

  it("blocks submit operations and triggers an alert if the batch variable is empty", () => {
    render(<BatchForm parameters={mockParameters} onSubmit={onSubmitMock} onSkip={onSkipMock} />);
    const form = screen.getByRole("heading", { name: "Batch Analysis & Correction" }).closest("form");

    fireEvent.submit(form!);

    expect(window.alert).toHaveBeenCalledWith("Please select a batch variable.");
    expect(onSubmitMock).not.toHaveBeenCalled();
  });

  it("triggers onSkip callback returning accurate case/control payload layouts upon clicking skip action", () => {
    render(<BatchForm parameters={mockParameters} onSubmit={onSubmitMock} onSkip={onSkipMock} />);

    fireEvent.click(screen.getByRole("button", { name: "Proceed to analysis" }));

    expect(onSkipMock).toHaveBeenCalledWith({
      group_column: "Sentrix_ID",
      control_group: "ID1",
      case_group: "ID2",
    });
  });

  it("disables forms and transforms button descriptive statuses completely when isLoading is set to true", () => {
    const { rerender } = render(
      <BatchForm parameters={mockParameters} onSubmit={onSubmitMock} onSkip={onSkipMock} isLoading={true} />
    );

    expect(screen.getByRole("button", { name: "Proceed to analysis" })).toBeDisabled();

    rerender(
      <BatchForm parameters={mockParameters} onSubmit={onSubmitMock} onSkip={onSkipMock} isLoading={false} />
    );
    expect(screen.getByRole("button", { name: "Proceed to analysis" })).toBeEnabled();
  });

  it("handles batch variable selection adjustments and filters it out of covariates safely", async () => {
    // Arrange
    render(<BatchForm parameters={mockParameters} onSubmit={onSubmitMock} onSkip={onSkipMock} />);

    // Target the select element exactly via its rendered accessibility name listed in the DOM tree
    const selectEl = screen.getByRole("combobox", { name: "Select a column…" });
    expect(selectEl).toBeInTheDocument();

    // Trigger the virtual selection click via the material container ID directly
    fireEvent.mouseDown(selectEl);

    // Locate the dynamic list item using regular expressions and select it
    const options = screen.getAllByRole("option");
    const targetOption = options.find((opt) => opt.textContent?.includes("Sentrix_ID"));
    if (targetOption) fireEvent.click(targetOption);

    // Verify submit button unlocks immediately
    const submitButton = screen.getByRole("button", { name: "Start Batch" });
    expect(submitButton).not.toBeDisabled();

    // Fire form submission event loop
    const form = screen.getByRole("heading", { name: "Batch Analysis & Correction" }).closest("form");
    fireEvent.submit(form!);

    expect(onSubmitMock).toHaveBeenCalledWith({
      batch_variable: "Sentrix_ID",
      covariates: [],
    });
  });

  it("manages analytical differential group comparison parameter switches successfully", () => {
    // Arrange
    render(<BatchForm parameters={mockParameters} onSubmit={onSubmitMock} onSkip={onSkipMock} />);

    // Target the comparison dropdown controller node by its exact accessibility mapping name
    const comparisonSelectInput = screen.getByRole("combobox", { name: "Comparison column" });
    fireEvent.mouseDown(comparisonSelectInput);

    // Switch selection criteria targets over to 'Sample_Group' instead
    const options = screen.getAllByRole("option");
    const targetOption = options.find((opt) => opt.textContent?.includes("Sample_Group"));
    if (targetOption) fireEvent.click(targetOption);

    // Click proceed to guarantee changed values map to the skip callback profile payload structure
    fireEvent.click(screen.getByRole("button", { name: "Proceed to analysis" }));
    expect(onSkipMock).toHaveBeenCalledWith({
      group_column: "Sample_Group",
      control_group: "Cancer",
      case_group: "Control",
    });
  });

});
