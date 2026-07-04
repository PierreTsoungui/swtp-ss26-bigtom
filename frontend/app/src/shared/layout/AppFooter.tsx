import { Link } from "react-router";

/**
 * The global application footer.
 *
 * Displays the project branding, attribution to the Software Engineering Project
 * at Technische Hochschule Mittelhessen, and links to legal information.
 */
export function AppFooter() {
  return (
    <footer className="border-t border-neutral-borderDefault bg-neutral-card px-6 py-6 text-sm text-neutral-textSecondary">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-semibold text-neutral-textPrimary">BigTom</p>
          <p className="mt-1">
            Developed as part of the Software Engineering Project at Technische Hochschule
            Mittelhessen.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <a
            href="https://www.thm.de/site/impressum.html"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-neutral-textSecondary underline-offset-4 hover:text-primary-hover hover:underline"
          >
            Imprint
          </a>
          <Link to="/datenschutz" className="font-medium text-neutral-textSecondary underline-offset-4 hover:text-primary-hover hover:underline">
            Privacy Policy
          </Link>
          <span>© 2026 BigTom</span>
        </div>
      </div>
    </footer>
  );
}
