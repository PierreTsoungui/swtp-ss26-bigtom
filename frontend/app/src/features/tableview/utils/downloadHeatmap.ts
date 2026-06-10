/**
 * Hilfsfunktion zum Herunterladen der Heatmap als PNG-Datei
 * Voraussetzung: Die Heatmap wurde bereits generiert und ist unter der angegebenen Job-ID verfügbar.
 * Sie sendet eine GET-Anfrage an den Endpunkt, um die Heatmap als Blob zu erhalten, und löst dann den Download im Browser aus.
 * @param jobId
 */
async function downloadHeatmap(jobId: string) {
    const response = await fetch(`/heatmap/${jobId}`);

    if (!response.ok) {
        throw new Error("Download failed");
    }

    const blob = await response.blob();

    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `heatmap_${jobId}.png`;

    document.body.appendChild(a);
    a.click();

    a.remove();

    window.URL.revokeObjectURL(url);
}

export default downloadHeatmap;