import { useNavigate } from "react-router";
import { Button } from "./Button";
import BackButton from "@shared/components/BackButton.tsx";

/** The situations the fallback page can represent. */
type FallbackVariant = "not-found" | "error";

/**
 * Props for the {@link FallbackPage}.
 */
interface FallbackPageProps {
  /** Which message/title to display. */
  variant: FallbackVariant;
  /** Optional callback invoked before navigating away (e.g. to clear an error boundary). */
  onReset?: () => void;
}

/** Title and description shown for each {@link FallbackVariant}. */
const fallbackContent: Record<FallbackVariant, { title: string; description: string }> = {
  "not-found": {
    title: "Page not found",
    description: "The page you requested does not exist or may have been moved.",
  },
  error: {
    title: "Something went wrong",
    description:
      "An unexpected error occurred while displaying this page. Please try again or return to the start page.",
  },
};

/**
 * Full-page fallback shown for an unknown route (`not-found`) or a caught
 * render error (`error`). Offers navigation back to the start page or to the
 * previous page, running {@link FallbackPageProps.onReset} first so any error
 * boundary state is cleared before navigating.
 *
 * @param props - See {@link FallbackPageProps}.
 */
export function FallbackPage({ variant, onReset }: FallbackPageProps) {
  const navigate = useNavigate();
  const content = fallbackContent[variant];

  const handleHome = () => {
    onReset?.();
    void navigate("/");
  };

  return (
    <section
      role={variant === "error" ? "alert" : undefined}
      aria-labelledby="fallback-title"
      className="flex min-h-full items-center justify-center px-6 py-16"
    >
      <div className="w-full max-w-2xl rounded-lg border border-neutral-borderDefault bg-neutral-card p-6 text-center shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">BigTom</p>
        <h1 id="fallback-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
          {content.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-neutral-textSecondary">
          {content.description}
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button variant="primary" onClick={handleHome}>
            Go to start page
          </Button>
          <BackButton />
        </div>
      </div>
    </section>
  );
}
