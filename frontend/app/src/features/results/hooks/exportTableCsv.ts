/**
 * Requests a CSV export of a result table from the backend and triggers a
 * browser download.
 *
 * Network access for the results feature lives here (in `hooks/`) rather than in
 * a component, per the frontend architecture. Fetching the file as a blob keeps
 * the user on the page and lets the caller set a human-readable file name.
 *
 * @param jobId - The analysis job id.
 * @param table - The result table to export (e.g. `"dmp"` or `"dmr"`); also used
 *   as the download file-name prefix.
 * @param params - Query parameters that mirror the on-screen sorting and filters,
 *   so the exported file matches exactly what the user sees.
 * @throws Error if the request fails (non-2xx response or network error).
 */
export async function exportTableCsv(
  jobId: string,
  table: string,
  params: URLSearchParams,
): Promise<void> {
  const response = await fetch(`/api/v1/table/${jobId}/${table}/export?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`CSV export failed (HTTP ${response.status})`);
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${table}_results_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.URL.revokeObjectURL(objectUrl);
  }
}
