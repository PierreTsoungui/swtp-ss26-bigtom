export interface WorkflowStep {
  id: number;
  label: string;
  pathPrefixes: string[];
}

export const workflowSteps: WorkflowStep[] = [
  { id: 1, label: "Upload", pathPrefixes: ["/", "/upload"] },
  { id: 2, label: "Filter", pathPrefixes: ["/analysis"] },
  { id: 3, label: "Normalization", pathPrefixes: ["/normalization"] },
  { id: 4, label: "Batch", pathPrefixes: ["/batch"] },
  { id: 5, label: "Results", pathPrefixes: ["/results"] },
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
