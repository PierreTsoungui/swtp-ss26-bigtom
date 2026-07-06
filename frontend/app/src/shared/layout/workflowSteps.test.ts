/**
 * Verifies the header workflow navigation sequence and routing rules.
 *
 * This test ensures that only the currently active workflow steps
 * (Upload, Filter, Normalization, Batch, and Results) are offered,
 * that removed legacy steps (Validation, Analysis, Quality Control, and Export)
 * are excluded, and that raw URL route pathnames map onto the correct pipeline states.
 */
import { describe, expect, it } from "vitest";
import { getWorkflowStepForPath, workflowSteps } from "./workflowSteps";

describe("workflowSteps utility", () => {
  it("defines the exact active navigation sequence matrix in the correct order", () => {
    // Arrange & Act & Assert
    expect(workflowSteps.map((step) => step.label)).toEqual([
      "Upload",
      "Filter",
      "Normalization",
      "Batch",
      "Results",
    ]);

    // Check sequential ID constraints
    expect(workflowSteps.map((step) => step.id)).toEqual([1, 2, 3, 4, 5]);

    // Ensure that obsolete pipeline states are no longer part of the metadata array
    expect(workflowSteps.map((step) => step.label)).not.toEqual(
      expect.arrayContaining(["Validation", "Analysis", "Quality Control", "Export"]),
    );
  });

  it("accurately resolves the matching milestone step metadata block based on the URL pathname", () => {
    // Arrange & Act & Assert
    expect(getWorkflowStepForPath("/upload")?.label).toBe("Upload");
    expect(getWorkflowStepForPath("/analysis/job-123")?.label).toBe("Filter");
    expect(getWorkflowStepForPath("/normalization/job-123")?.label).toBe("Normalization");
    expect(getWorkflowStepForPath("/batch/job-123")?.label).toBe("Batch");
    expect(getWorkflowStepForPath("/results/job-123")?.label).toBe("Results");

    // Unmapped standalone routes must return undefined fallback statuses
    expect(getWorkflowStepForPath("/privacy")).toBeUndefined();
  });
});
