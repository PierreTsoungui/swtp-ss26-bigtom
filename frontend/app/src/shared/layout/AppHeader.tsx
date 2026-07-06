import AnalyticsIcon from "@mui/icons-material/Analytics";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { StepIndicator } from "./StepIndicator";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Button } from "../components/Button";

/**
 * A single in-page anchor shown in the landing-page navigation.
 *
 * The shell renders these links but does not own the list — the composition root
 * injects the active feature's sections (see {@link AppHeaderProps.sections}),
 * so the shared layer stays free of any feature dependency.
 */
export interface NavSection {
  /** Anchor target (the section element's `id`). */
  id: string;
  /** Label shown in the navigation. */
  label: string;
}

/**
 * Props for the AppHeader component.
 */
interface AppHeaderProps {
  /** The name of the current analysis phase in header (e.g., "Filtering", "Normalization"). */
  currentPhase: string;
  /** The ID of the active step, passed to the {@link StepIndicator}. */
  currentStepId?: number;
  /**
   * If true, hides progress indicators and shows a simplified layout.
   * @default false
   */
  isLandingPage?: boolean;
  /**
   * Whether to display the pipeline progress steps in the header.
   * @default true
   */
  showStepIndicator?: boolean;
  /** Whether an analysis is currently loaded or running, enabling the reset option. */
  isAnalysisActive: boolean;
  /**
   * In-page sections rendered as the landing-page navigation. Injected by the
   * composition root so the shell need not know about any feature. @default []
   */
  sections?: readonly NavSection[];
  /**
   * Whether the reset operation is currently being processed.
   * @default false
   */
  isResetting?: boolean;
  /** Callback triggered when the user confirms an application reset. */
  onReset: () => void;
}

/**
 * The primary navigation and status header of the application.
 *
 * It displays the brand logo, tracks the user's progress through the
 * analysis pipeline using a {@link StepIndicator}, and provides a
 * global reset action.
 */
export function AppHeader({
  currentPhase,
  currentStepId,
  isLandingPage = false,
  showStepIndicator = true,
  isAnalysisActive,
  sections = [],
  isResetting = false,
  onReset,
}: AppHeaderProps) {
  // Reset permanently deletes the analysis and all of its data, so it is gated
  // behind an explicit confirmation dialog.
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Close the dialog once a confirmed reset finishes. On success `onReset`
  // navigates away (this header stays mounted across routes, so the dialog would
  // otherwise linger); on failure control returns here and the dialog closes so
  // the user can try again. The transition true -> false marks completion.
  const wasResetting = useRef(false);
  useEffect(() => {
    if (wasResetting.current && !isResetting) setConfirmOpen(false);
    wasResetting.current = isResetting;
  }, [isResetting]);

  return (
    <header
      className={`border-b border-neutral-borderDefault bg-neutral-card px-6 py-4 ${
        // On the landing page the header doubles as the section navigation, so it
        // stays pinned to the top while scrolling. Other routes keep the header
        // in normal flow. z-40 sits below modal overlays (z-50).
        isLandingPage ? "sticky top-0 z-40" : ""
      }`}
    >
      <div
        className={`mx-auto max-w-7xl ${
          isLandingPage
            ? "flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
            : "grid gap-4 lg:grid-cols-[1fr_3fr_1fr] lg:items-center"
        }`}
      >
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-2xl font-bold text-neutral-textPrimary hover:text-primary-hover"
        >
          <AnalyticsIcon fontSize="large" />
          <span>MethylAnalyzer</span>
        </Link>

        {isLandingPage && (
          <nav aria-label="Landing page sections">
            <ul className="flex flex-wrap items-center justify-end gap-x-1 gap-y-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block rounded-md px-3 py-2 text-sm font-medium text-neutral-textSecondary transition-colors hover:bg-neutral-surface hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {!isLandingPage && (
          <>
            <div className="space-y-2 text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-neutral-textSecondary">
                {currentPhase}
              </p>
              {showStepIndicator && <StepIndicator currentStepId={currentStepId} />}
            </div>

            <div className="flex justify-start lg:justify-end">
              <Button
                variant="secondary"
                onClick={() => setConfirmOpen(true)}
                disabled={!isAnalysisActive || isResetting}
              >
                {isResetting ? "Resetting..." : "Reset"}
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        destructive
        title="Delete this analysis?"
        description={
          <>
            This permanently deletes the current analysis and all of its uploaded files and results
            from the server. This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        busy={isResetting}
        busyLabel="Deleting…"
        onConfirm={onReset}
        onCancel={() => setConfirmOpen(false)}
      />
    </header>
  );
}
