export interface WorkflowStep {
  id: number;
  label: string;
  pathPrefixes: string[];
}

export const workflowSteps: WorkflowStep[] = [
  { id: 1, label: "Upload", pathPrefixes: ["/", "/upload"] },
  // Validation is currently handled inside the upload flow; this prefix is ready for a future route.
  { id: 2, label: "Validation", pathPrefixes: ["/validation"] },
  { id: 3, label: "Analysis", pathPrefixes: ["/analysis"] },
  { id: 4, label: "Normalization", pathPrefixes: ["/normalization"] },
  { id: 5, label: "Quality Control", pathPrefixes: ["/quality-control", "/qc"] },
  { id: 6, label: "Results", pathPrefixes: ["/results"] },
  { id: 7, label: "Export", pathPrefixes: ["/export"] },
];

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
