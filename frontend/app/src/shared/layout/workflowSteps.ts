/**
 * Represents a discrete stage in the analysis pipeline.
 */
export interface WorkflowStep {
  /** Numerical order of the step in the workflow. */
  id: number;
  /** Human-readable name displayed in the UI. */
  label: string;
  /** List of URL path prefixes associated with this step. */
  pathPrefixes: string[];
}

/**
 * Static configuration of all steps in the DNA methylation analysis pipeline.
 * Defines the order and routing logic for the {@link StepIndicator}.
 */
export const workflowSteps: WorkflowStep[] = [
  { id: 1, label: "Upload", pathPrefixes: ["/", "/upload"] },
  { id: 2, label: "Filter", pathPrefixes: ["/analysis"] },
  { id: 3, label: "Normalization", pathPrefixes: ["/normalization"] },
  { id: 4, label: "Batch", pathPrefixes: ["/batch"] },
  { id: 5, label: "Results", pathPrefixes: ["/results"] },
];

/**
 * Identifies the current workflow step based on a given URL path.
 *
 * It matches the path against defined prefixes, accounting for root paths
 * and dynamic segments (e.g., job IDs).
 *
 * @param pathname - The current URL path (e.g., from `location.pathname`).
 * @returns The matching {@link WorkflowStep} or `undefined` if no match is found.
 */
export function getWorkflowStepForPath(pathname: string): WorkflowStep | undefined {
  const normalizedPath = pathname === "" ? "/" : pathname;

  return workflowSteps.find((step) =>
    step.pathPrefixes.some((prefix) => {
      if (prefix === "/") {
        return normalizedPath === "/";
      }

      return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
    }),
  );
}
