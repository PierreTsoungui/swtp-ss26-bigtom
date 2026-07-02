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

describe("ColumnRoleMapper", () => {
  it("renders one dropdown per canonical role", () => {
    render(<ColumnRoleMapper columns={COLUMNS} mapping={EMPTY} onChange={() => {}} />);
    for (const role of ["Sentrix_ID", "Sentrix_Position", "Sample_Group", "Sample_Name"]) {
      expect(screen.getByLabelText(`Column for ${role}`)).toBeInTheDocument();
    }
  });

  it("reports the chosen column to onChange", () => {
    const onChange = vi.fn();
    render(<ColumnRoleMapper columns={COLUMNS} mapping={EMPTY} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Column for Sentrix_ID"), { target: { value: "Chip" } });
    expect(onChange).toHaveBeenCalledWith("sentrix_id", "Chip");
  });

  it("hides a column already used by another role (no double assignment)", () => {
    const mapping: RoleSelection = { ...EMPTY, sentrix_id: "Chip" };
    render(<ColumnRoleMapper columns={COLUMNS} mapping={mapping} onChange={() => {}} />);

    // "Chip" is still the option for its own role …
    const idSelect = screen.getByLabelText("Column for Sentrix_ID");
    expect(within(idSelect).getByRole("option", { name: "Chip" })).toBeInTheDocument();

    // … but no longer offered to the other roles.
    const posSelect = screen.getByLabelText("Column for Sentrix_Position");
    expect(within(posSelect).queryByRole("option", { name: "Chip" })).not.toBeInTheDocument();
  });
});
