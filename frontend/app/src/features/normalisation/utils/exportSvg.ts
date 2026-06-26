/**
 * Exportiert ein SVG-Element als PNG-Datei (NRM-04).
 *
 * Der im Frontend gerenderte PCA-Plot (inkl. gewählter Farben und Labels) wird
 * serialisiert, auf einen Canvas mit weißem Hintergrund gezeichnet und als PNG
 * heruntergeladen. ``scale`` erhöht die Pixeldichte, damit der Export auch im
 * Ausdruck/in Publikationen scharf und lesbar ist.
 */
export function exportSvgAsPng(
  svg: SVGSVGElement,
  filename: string,
  width: number,
  height: number,
  scale = 2,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xml = new XMLSerializer().serializeToString(svg);
    const svgDataUrl =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas-Kontext nicht verfügbar"));
        return;
      }

      // Weißer Hintergrund für Druck/Screenshot (SVG ist sonst transparent).
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("PNG-Export fehlgeschlagen"));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve();
      }, "image/png");
    };
    image.onerror = () => reject(new Error("SVG konnte nicht gerendert werden"));
    image.src = svgDataUrl;
  });
}
