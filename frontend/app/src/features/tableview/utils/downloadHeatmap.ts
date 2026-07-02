/**
 * Triggers a browser download for the generated heatmap.
 *
 * Fetches the heatmap file from the server as a binary blob and uses
 * a temporary anchor element to initiate the download.
 *
 * @param jobId - The unique identifier of the analysis job.
 * @param format - The file format to request: 'png' for images or 'pdf' for vector graphics.
 * @throws Error if the server response is not successful.
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
