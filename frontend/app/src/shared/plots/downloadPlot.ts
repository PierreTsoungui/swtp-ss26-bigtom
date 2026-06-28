/**
 * Fetches a server-rendered plot as a blob and triggers a browser download.
 *
 * Used for every static plot export (density, SVD, heatmap) so the download
 * behaviour — and error handling — is identical everywhere. Fetching as a blob
 * (instead of navigating to the URL) keeps the user on the page and lets us set
 * an explicit, human-readable file name.
 *
 * @param url      Fully-qualified URL serving the file (PNG or PDF).
 * @param filename File name offered to the user, including extension.
 * @throws Error when the request fails (non-2xx response or network error).
 */
export async function downloadPlot(url: string, filename: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Download failed (HTTP ${response.status})`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}
