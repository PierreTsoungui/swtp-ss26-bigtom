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
      <div className="text-sm text-slate-500">
        {pageSize} Einträge pro Seite
      </div>

      <div className="flex items-center gap-2">
        {/* Erste Seite */}
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="px-3 py-1 border border-slate-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
          title="Erste Seite"
        >
          «
        </button>

        {/* Vorherige Seite */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1 border border-slate-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
          title="Vorherige Seite"
        >
          ‹
        </button>

        {/* Seitenzahlen */}
        {getPageNumbers().map((pageNumber) => (
          <button
            key={pageNumber}
            onClick={() => onPageChange(pageNumber)}
            className={`
              px-3 py-1 border rounded-md text-sm transition-colors
              ${pageNumber === page
                ? "bg-blue-600 text-white border-blue-600"
                : "border-slate-300 hover:bg-slate-50"
              }
            `}
          >
            {pageNumber}
          </button>
        ))}

        {/* Nächste Seite */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1 border border-slate-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
          title="Nächste Seite"
        >
          ›
        </button>

        {/* Letzte Seite */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="px-3 py-1 border border-slate-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
          title="Letzte Seite"
        >
          »
        </button>
      </div>

      <div className="text-sm text-slate-500">
        Seite {page} von {totalPages}
      </div>
    </div>
  );
}