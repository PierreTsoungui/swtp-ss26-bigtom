/**
 * Downloads the generated heatmap as PNG or PDF.
 * Requires the heatmap to have been generated for the given job id.
 * Fetches the file as a blob and triggers a browser download.
 *
 * @param jobId  the job id
 * @param format "png" (default) or "pdf"
 */
async function downloadHeatmap(jobId: string, format: "png" | "pdf" = "png") {
    const response = await fetch(`/api/v1/heatmap/${jobId}?format=${format}`);

    if (!response.ok) {
        throw new Error("Download failed");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `heatmap_${jobId}.${format}`;

    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
}

export default downloadHeatmap;
