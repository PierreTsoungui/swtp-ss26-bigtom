import { Link } from "react-router";

export function AppFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-4 text-sm text-slate-600">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>© BigTom</span>
        <div className="flex gap-4">
          <a
            href="https://www.thm.de/site/impressum.html"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-700 hover:text-blue-700"
          >
            Impressum
          </a>
          <Link to="/datenschutz" className="font-medium text-slate-700 hover:text-blue-700">
            Datenschutz
          </Link>
        </div>
      </div>
    </footer>
  );
}
