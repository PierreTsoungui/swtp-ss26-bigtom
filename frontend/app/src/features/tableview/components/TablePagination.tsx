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
export function TablePagination({
  page,
  totalPages,
  pageSize,
  onPageChange,
}: Props) {

  /**
   * Calculates the subset of page numbers to display.
   * Ensures the UI remains clean even with thousands of pages.
   */
  const getPageNumbers = () => {
    const maxVisible = 5;
    const pages = [];
    
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-between mt-4">
      <div className="text-sm text-neutral-textSecondary">
        {pageSize} records per page
      </div>

      <div className="flex items-center gap-2">
        {/* First page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="px-3 py-1 border border-neutral-borderEmphasis rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-background transition-colors"
          title="First page"
        >
          «
        </button>

        {/* Previous page */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1 border border-neutral-borderEmphasis rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-background transition-colors"
          title="Previous page"
        >
          ‹
        </button>

        {/* Page numbers */}
        {getPageNumbers().map((pageNumber) => (
          <button
            key={pageNumber}
            onClick={() => onPageChange(pageNumber)}
            className={`
              px-3 py-1 border rounded-md text-sm transition-colors
              ${pageNumber === page
                ? "bg-primary text-primary-text border-primary"
                : "border-neutral-borderEmphasis hover:bg-neutral-background"
              }
            `}
          >
            {pageNumber}
          </button>
        ))}

        {/* Next page */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1 border border-neutral-borderEmphasis rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-background transition-colors"
          title="Next page"
        >
          ›
        </button>

        {/* Last page */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="px-3 py-1 border border-neutral-borderEmphasis rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-background transition-colors"
          title="Last page"
        >
          »
        </button>
      </div>

      <div className="text-sm text-neutral-textSecondary">
        Page {page} of {totalPages}
      </div>
    </div>
  );
}
