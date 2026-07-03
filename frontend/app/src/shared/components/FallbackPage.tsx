import { useLocation, useNavigate } from "react-router";

type FallbackVariant = "not-found" | "error";

interface FallbackPageProps {
  variant: FallbackVariant;
  onReset?: () => void;
}

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

export function FallbackPage({ variant, onReset }: FallbackPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const content = fallbackContent[variant];

  const handleHome = () => {
    onReset?.();
    void navigate("/");
  };

  const handleBack = () => {
    onReset?.();

    if (window.history.length > 1 || location.key !== "default") {
      void navigate(-1);
      return;
    }

    void navigate("/");
  };

  return (
    <section
      role={variant === "error" ? "alert" : undefined}
      aria-labelledby="fallback-title"
      className="flex min-h-full items-center justify-center px-6 py-16"
    >
      <div className="w-full max-w-2xl rounded-lg border border-neutral-borderDefault bg-neutral-card p-6 text-center shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          BigTom
        </p>
        <h1 id="fallback-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
          {content.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-neutral-textSecondary">
          {content.description}
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleHome}
            className="rounded-full border-2 border-primary bg-primary px-6 py-3 font-semibold text-primary-text transition-colors hover:bg-primary-hover"
          >
            Go to start page
          </button>
          <button
            type="button"
            onClick={handleBack}
            className="rounded-full border-2 border-neutral-textSecondary bg-neutral-card px-6 py-3 font-semibold text-neutral-textSecondary transition-colors hover:bg-neutral-surface hover:text-neutral-textPrimary"
          >
            Back
          </button>
        </div>
      </div>
    </section>
  );
}
