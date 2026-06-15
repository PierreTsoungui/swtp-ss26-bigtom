import { Link } from "react-router";

export function AppFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-6 text-sm text-slate-600">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-semibold text-slate-800">BigTom</p>
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
            className="font-medium text-slate-700 hover:text-blue-700"
          >
            Imprint
          </a>
          <Link to="/datenschutz" className="font-medium text-slate-700 hover:text-blue-700">
            Privacy Policy
          </Link>
          <span>© 2026 BigTom</span>
        </div>
      </div>
    </footer>
  );
}
