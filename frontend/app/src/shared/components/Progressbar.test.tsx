import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Progressbar from "./Progressbar.tsx";
import { JobPhase, type JobStatus, JobStatusValue } from "../types/JobTypes.ts";

// Mock MUI LinearProgress to avoid deep shadow DOM rendering complications
vi.mock("@mui/material/LinearProgress", () => ({
  default: ({ value, color }: { value: number; color: string }) => (
    <div
      role="progressbar"
      aria-valuenow={value}
      data-color={color}
      data-testid="linear-progress"
    />
  ),
}));

// Mock the nested Router if navigate is used in parent contexts
vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

// Helper utility to construct structured JobStatus mock models
function buildJobStatus(overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    job_id: "test-uuid-1234",
    status: JobStatusValue.RUNNING,
    phase: JobPhase.FILTERING,
    progress_percent: 50,
    current_step: "Applying SNP filter step...",
    ...overrides,
  };
}

describe("Progressbar Component", () => {
  describe("Structural Rendering & Core Content", () => {
    it("displays the default 'Analyzing' header when the job is currently processing generic stages", () => {
      render(<Progressbar jobStatus={buildJobStatus()} />);
      expect(screen.getByRole("heading", { name: "Analyzing" })).toBeInTheDocument();
    });

    it("switches the main header text when processing the normalization preview phase", () => {
      render(<Progressbar jobStatus={buildJobStatus({ phase: JobPhase.NORMALIZATION_PREVIEW })} />);
      expect(
        screen.getByRole("heading", { name: "Creating normalization preview..." }),
      ).toBeInTheDocument();
    });

    it("renders the ongoing current operational step description text block", () => {
      render(
        <Progressbar
          jobStatus={buildJobStatus({ current_step: "Running detection p-value filters..." })}
        />,
      );
      expect(screen.getByText("Running detection p-value filters...")).toBeInTheDocument();
    });

    it("renders the calculated progress percentage text string safely", () => {
      render(<Progressbar jobStatus={buildJobStatus({ progress_percent: 75 })} />);
      expect(screen.getByText("75%")).toBeInTheDocument();
    });
  });

  describe("Sliding Next Button Action Triggers", () => {
    it("mounts and displays the 'Next' button if explicit visibility flag is passed", () => {
      render(<Progressbar jobStatus={buildJobStatus()} showNextButton />);
      expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    });

    it("enforces a disabled HTML state on the next trigger button if processing blocks it", () => {
      render(<Progressbar jobStatus={buildJobStatus()} showNextButton nextDisabled={true} />);
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("keeps the next button clickable when the underlying data preview state clears", () => {
      render(<Progressbar jobStatus={buildJobStatus()} showNextButton nextDisabled={false} />);
      expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
    });

    it("executes the parent callback exactly once when an enabled next button is clicked", () => {
      const onNextMock = vi.fn();
      render(
        <Progressbar
          jobStatus={buildJobStatus()}
          showNextButton={true}
          nextDisabled={false}
          onNext={onNextMock}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(onNextMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("LinearProgress Value and Color Mappings", () => {
    it("maps and delivers progress_percent inputs directly down to the LinearProgress component", () => {
      render(<Progressbar jobStatus={buildJobStatus({ progress_percent: 65 })} />);
      const bar = screen.getByTestId("linear-progress");
      expect(bar).toHaveAttribute("aria-valuenow", "65");
      expect(bar).toHaveAttribute("data-color", "primary"); // Ongoing baseline color
    });

    it("adjusts progress bar styling to reflect a successful completion state at 100 percent", () => {
      render(
        <Progressbar
          jobStatus={buildJobStatus({ progress_percent: 100, status: JobStatusValue.COMPLETED })}
        />,
      );
      const bar = screen.getByTestId("linear-progress");
      expect(bar).toHaveAttribute("aria-valuenow", "100");
      expect(bar).toHaveAttribute("data-color", "success");
    });

    it("switches progress state styles and shows the alert summary block during analytical failures", () => {
      const failedStatus = buildJobStatus({
        status: JobStatusValue.FAILED,
        error: {
          type: "about:blank",
          title: "Processing Failed",
          status: 500,
          detail: "The Illumina parser encountered corrupted data structures.",
          instance: "/api/v1/jobs/test",
        },
      });

      render(<Progressbar jobStatus={failedStatus} />);

      // Check bar color becomes error state
      const bar = screen.getByTestId("linear-progress");
      expect(bar).toHaveAttribute("data-color", "error");

      // Check alert error text gets mounted onto the screen
      expect(
        screen.getByText("The Illumina parser encountered corrupted data structures."),
      ).toBeInTheDocument();
    });

    it("renders a generic fallback notification if the failure error descriptor lacks specific details", () => {
      const failedStatusWithoutDetail = buildJobStatus({
        status: JobStatusValue.FAILED,
        error: {
          type: "about:blank",
          title: "Fatal",
          status: 500,
          detail: "", // Empty details string trigger
          instance: "/api/v1/jobs/test",
        },
      });

      render(<Progressbar jobStatus={failedStatusWithoutDetail} />);
      expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
    });
  });
});
