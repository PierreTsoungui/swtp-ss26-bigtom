import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ColumnRoleMapper, { type RoleSelection } from "./ColumnRoleMapper";

const COLUMNS = ["Patient", "Diagnosis", "Chip", "Well"];

const EMPTY: RoleSelection = {
  sentrix_id: null,
  sentrix_position: null,
  sample_group: null,
  sample_name: null,
};

describe("ColumnRoleMapper Component", () => {
  it("renders one select dropdown per canonical required metadata role with helper instructions", () => {
    // Arrange & Act
    render(<ColumnRoleMapper columns={COLUMNS} mapping={EMPTY} onChange={vi.fn()} />);

    // Assert headers and descriptions are safely mounted
    expect(screen.getByRole("heading", { name: /Column roles/i })).toBeInTheDocument();
    expect(screen.getByText(/Assign each required role to a column/i)).toBeInTheDocument();

    // Verify all four canonical dropdown controls exist via accessibility descriptors
    for (const role of ["Sentrix_ID", "Sentrix_Position", "Sample_Group", "Sample_Name"]) {
      expect(screen.getByLabelText(`Column for ${role}`)).toBeInTheDocument();
    }
  });

  it("reports the chosen column identifier directly back to the parent onChange callback loop", () => {
    // Arrange
    const onChangeMock = vi.fn();
    render(<ColumnRoleMapper columns={COLUMNS} mapping={EMPTY} onChange={onChangeMock} />);

    // Act - Choose 'Chip' under the Sentrix_ID dropdown row context
    const idSelect = screen.getByLabelText("Column for Sentrix_ID");
    fireEvent.change(idSelect, { target: { value: "Chip" } });

    // Assert callback tracking parameters
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith("sentrix_id", "Chip");
  });

  it("returns a clean null value target descriptor if the clear empty fallback option is selected", () => {
    // Arrange
    const onChangeMock = vi.fn();
    const activeMapping: RoleSelection = { ...EMPTY, sentrix_id: "Chip" };
    render(<ColumnRoleMapper columns={COLUMNS} mapping={activeMapping} onChange={onChangeMock} />);

    // Act - Change selection back to the placeholder row item
    const idSelect = screen.getByLabelText("Column for Sentrix_ID");
    fireEvent.change(idSelect, { target: { value: "" } });

    // Assert clearing parameters pass correctly down the pipeline
    expect(onChangeMock).toHaveBeenCalledWith("sentrix_id", null);
  });

  it("hides a column value that is already used by another active role to prevent cross-assignment duplicate errors", () => {
    // Arrange
    const mapping: RoleSelection = { ...EMPTY, sentrix_id: "Chip" };
    render(<ColumnRoleMapper columns={COLUMNS} mapping={mapping} onChange={vi.fn()} />);

    // Act & Assert
    // 1. "Chip" must remain an option inside its own current role dropdown context
    const idSelect = screen.getByLabelText("Column for Sentrix_ID");
    expect(within(idSelect).getByRole("option", { name: "Chip" })).toBeInTheDocument();

    // 2. "Chip" must be completely stripped from alternative option lists to protect exclusive mapping paths
    const posSelect = screen.getByLabelText("Column for Sentrix_Position");
    expect(within(posSelect).queryByRole("option", { name: "Chip" })).not.toBeInTheDocument();
  });

  // NEW TESTS

  it("enforces disabled attributes on all select fields when the disabled configuration prop flags true", () => {
    // Arrange & Act
    render(<ColumnRoleMapper columns={COLUMNS} mapping={EMPTY} onChange={vi.fn()} disabled={true} />);

    // Assert fields are non-interactive
    for (const role of ["Sentrix_ID", "Sentrix_Position", "Sample_Group", "Sample_Name"]) {
      expect(screen.getByLabelText(`Column for ${role}`)).toBeDisabled();
    }
  });

  it("automatically forces select controllers to lock up if the incoming sample sheet columns list array is completely empty", () => {
    // Arrange & Act
    render(<ColumnRoleMapper columns={[]} mapping={EMPTY} onChange={vi.fn()} />);

    // Assert locking parameters trigger even when disabled prop itself is absent
    for (const role of ["Sentrix_ID", "Sentrix_Position", "Sample_Group", "Sample_Name"]) {
      expect(screen.getByLabelText(`Column for ${role}`)).toBeDisabled();
    }
  });
});
