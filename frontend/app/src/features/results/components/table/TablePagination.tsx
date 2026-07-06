/**
 * Props for the TablePagination component.
 */
type Props = {
  /** Current active page (1-indexed). */
  page: number;
  /** Total number of available pages. */
  totalPages: number;
  /** Number of records displayed per page. */
  pageSize: number;
  /** Callback fired when a new page is selected. */
  onPageChange: (page: number) => void;
};

/**
 * A navigation control for paginated data tables.
 *
 * It implements a "sliding window" algorithm to display a maximum of 5 page
 * buttons at once, ensuring the current page remains centered where possible.
 * Includes quick-jump actions for the first and last pages.
 */
export function TablePagination({ page, totalPages, pageSize, onPageChange }: Props) {
  /**
   * Calculates the subset of page numbers to display.
   * Ensures the UI remains clean even with thousands of pages.
   */
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
      <div className="text-sm text-neutral-textSecondary">{pageSize} entries per page</div>

      <nav className="flex items-center gap-2" aria-label="Seitennavigation">
        {/* First page */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="min-h-10 rounded-md border border-neutral-borderEmphasis px-3 py-1 text-sm transition-colors hover:bg-neutral-surface disabled:cursor-not-allowed disabled:border-neutral-borderEmphasis disabled:bg-neutral-surface disabled:text-neutral-textSecondary"
          title="First page"
          aria-label="To first page"
        >
          «
        </button>

        {/* Previous page */}
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="min-h-10 rounded-md border border-neutral-borderEmphasis px-3 py-1 text-sm transition-colors hover:bg-neutral-surface disabled:cursor-not-allowed disabled:border-neutral-borderEmphasis disabled:bg-neutral-surface disabled:text-neutral-textSecondary"
          title="Previous page"
          aria-label="To previous page"
        >
          ‹
        </button>

        {/* Page Numbers */}
        {getPageNumbers().map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onPageChange(pageNumber)}
            aria-label={`Page ${pageNumber}`}
            aria-current={pageNumber === page ? "page" : undefined}
            className={`
              min-h-10 px-3 py-1 border rounded-md text-sm transition-colors
              ${
                pageNumber === page
                  ? "bg-primary text-primary-text border-primary"
                  : "border-neutral-borderEmphasis hover:bg-neutral-surface"
              }
            `}
          >
            {pageNumber}
          </button>
        ))}

        {/* Next page */}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="min-h-10 rounded-md border border-neutral-borderEmphasis px-3 py-1 text-sm transition-colors hover:bg-neutral-surface disabled:cursor-not-allowed disabled:border-neutral-borderEmphasis disabled:bg-neutral-surface disabled:text-neutral-textSecondary"
          title="Next page"
          aria-label="To next page"
        >
          ›
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="min-h-10 rounded-md border border-neutral-borderEmphasis px-3 py-1 text-sm transition-colors hover:bg-neutral-surface disabled:cursor-not-allowed disabled:border-neutral-borderEmphasis disabled:bg-neutral-surface disabled:text-neutral-textSecondary"
          title="Last page"
          aria-label="To last page"
        >
          »
        </button>
      </nav>

      <div className="text-sm text-neutral-textSecondary">
        Page {page} of {totalPages}
      </div>
    </div>
  );
}
