type Props = {
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function TablePagination({
  page,
  totalPages,
  pageSize,
  onPageChange,
}: Props) {
  // Zeige maximal 5 Seitenzahlen an
  const getPageNumbers = () => {
    const maxVisible = 5;
    const pages = [];
    
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-neutral-textSecondary">
        {pageSize} Einträge pro Seite
      </div>

      <nav className="flex items-center gap-2" aria-label="Seitennavigation">
        {/* Erste Seite */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="min-h-10 rounded-md border border-neutral-textSecondary px-3 py-1 text-sm transition-colors hover:bg-neutral-background disabled:cursor-not-allowed disabled:border-neutral-borderEmphasis disabled:bg-neutral-surface disabled:text-neutral-textSecondary"
          title="Erste Seite"
          aria-label="Zur ersten Seite"
        >
          «
        </button>

        {/* Vorherige Seite */}
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="min-h-10 rounded-md border border-neutral-textSecondary px-3 py-1 text-sm transition-colors hover:bg-neutral-background disabled:cursor-not-allowed disabled:border-neutral-borderEmphasis disabled:bg-neutral-surface disabled:text-neutral-textSecondary"
          title="Vorherige Seite"
          aria-label="Zur vorherigen Seite"
        >
          ‹
        </button>

        {/* Seitenzahlen */}
        {getPageNumbers().map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onPageChange(pageNumber)}
            aria-label={`Seite ${pageNumber}`}
            aria-current={pageNumber === page ? "page" : undefined}
            className={`
              min-h-10 px-3 py-1 border rounded-md text-sm transition-colors
              ${pageNumber === page
                ? "bg-primary text-primary-text border-primary"
                : "border-neutral-textSecondary hover:bg-neutral-background"
              }
            `}
          >
            {pageNumber}
          </button>
        ))}

        {/* Nächste Seite */}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="min-h-10 rounded-md border border-neutral-textSecondary px-3 py-1 text-sm transition-colors hover:bg-neutral-background disabled:cursor-not-allowed disabled:border-neutral-borderEmphasis disabled:bg-neutral-surface disabled:text-neutral-textSecondary"
          title="Nächste Seite"
          aria-label="Zur nächsten Seite"
        >
          ›
        </button>

        {/* Letzte Seite */}
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="min-h-10 rounded-md border border-neutral-textSecondary px-3 py-1 text-sm transition-colors hover:bg-neutral-background disabled:cursor-not-allowed disabled:border-neutral-borderEmphasis disabled:bg-neutral-surface disabled:text-neutral-textSecondary"
          title="Letzte Seite"
          aria-label="Zur letzten Seite"
        >
          »
        </button>
      </nav>

      <div className="text-sm text-neutral-textSecondary">
        Seite {page} von {totalPages}
      </div>
    </div>
  );
}
