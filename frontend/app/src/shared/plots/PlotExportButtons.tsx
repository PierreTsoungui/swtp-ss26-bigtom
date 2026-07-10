import { useState } from "react";
import { Download } from "@mui/icons-material";

import { downloadPlot } from "./downloadPlot";
import { urlForFormat, type PlotFormat, type PlotSource } from "./types";
import { logger } from "../utils/logger";
import { Button } from "../components/Button";

interface PlotExportButtonsProps {
  /** The plot to export. */
  source: PlotSource;
  /** Button size. Use "small" inside compact cards. @default "medium" */
  size?: "small" | "medium";
  /** Called when a download fails so the host can surface the error. */
  onError?: (error: unknown) => void;
  /** Extra classes for the wrapping flex container. */
  className?: string;
}

/**
 * The single, consistent "Export PNG" / "Export PDF" control used next to every
 * static plot. While a download is in flight both buttons are disabled and the
 * active one shows a pending label, preventing duplicate requests.
 */
function PlotExportButtons({
  source,
  size = "medium",
  onError,
  className = "",
}: PlotExportButtonsProps) {
  const [pending, setPending] = useState<PlotFormat | null>(null);

  const handleExport = async (format: PlotFormat) => {
    if (pending) return;
    setPending(format);
    try {
      await downloadPlot(urlForFormat(source, format), `${source.downloadName}.${format}`);
    } catch (error) {
      if (onError) {
        onError(error);
      } else {
        logger.error(`Plot export (${format}) failed`, error);
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {(["png", "pdf"] as const).map((format) => (
        <Button
          key={format}
          variant="secondary"
          size={size === "small" ? "sm" : "md"}
          disabled={pending !== null}
          onClick={() => void handleExport(format)}
          aria-label={`Export ${source.title} as ${format.toUpperCase()}`}
        >
          <Download fontSize="small" />
          {pending === format ? "Exporting…" : `Export ${format.toUpperCase()}`}
        </Button>
      ))}
    </div>
  );
}

export default PlotExportButtons;
