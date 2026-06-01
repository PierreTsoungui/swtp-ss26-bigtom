/**
 * Prüft die Workflow-Navigation im Header.
 *
 * Der Test stellt sicher, dass nur die aktuell erlaubten Schritte
 * Upload, Filter, Normalization, Batch und Results angezeigt werden,
 * dass entfernte Schritte wie Validation, Analysis, Quality Control
 * und Export nicht mehr enthalten sind und dass die Routen den
 * korrekten Workflow-Schritten zugeordnet werden.
 */
import { describe, expect, it } from "vitest";
import { getWorkflowStepForPath, workflowSteps } from "./workflowSteps";

describe("workflowSteps", () => {
  it("definiert die aktuelle Navigation in der richtigen Reihenfolge", () => {
    expect(workflowSteps.map((step) => step.label)).toEqual([
      "Upload",
      "Filter",
      "Normalization",
      "Batch",
      "Results",
    ]);
    expect(workflowSteps.map((step) => step.id)).toEqual([1, 2, 3, 4, 5]);
    expect(workflowSteps.map((step) => step.label)).not.toEqual(
      expect.arrayContaining(["Validation", "Analysis", "Quality Control", "Export"]),
    );
  });

  it("ermittelt den passenden Schritt anhand der Route", () => {
    expect(getWorkflowStepForPath("/upload")?.label).toBe("Upload");
    expect(getWorkflowStepForPath("/analysis/job-123")?.label).toBe("Filter");
    expect(getWorkflowStepForPath("/normalization/job-123")?.label).toBe("Normalization");
    expect(getWorkflowStepForPath("/batch/job-123")?.label).toBe("Batch");
    expect(getWorkflowStepForPath("/results/job-123")?.label).toBe("Results");
    expect(getWorkflowStepForPath("/datenschutz")).toBeUndefined();
  });
});
