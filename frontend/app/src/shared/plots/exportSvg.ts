/**
 * Exports an SVG element as a high-resolution PNG file.
 *
 * The SVG is serialized, rendered onto a canvas with a solid background,
 * and downloaded. High-density scaling ensures sharpness for print and publications.
 *
 * @param svg - The SVG element to capture.
 * @param filename - Target name for the downloaded file.
 * @param width - Base width of the image.
 * @param height - Base height of the image.
 * @param scale - Pixel density multiplier (e.g., 2 for Retina quality).
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
    const svgDataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context not available"));
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("PNG export failed"));
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
    image.onerror = () => reject(new Error("SVG could not be rendered"));
    image.src = svgDataUrl;
  });
}
