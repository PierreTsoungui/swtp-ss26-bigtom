import { useEffect, useState } from "react";

interface SvdPlotProps {
  jobId: string | undefined;
}

export function SvdPlot({ jobId }: SvdPlotProps) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!jobId) {
      setAvailable(null);
      return;
    }

    const url = `/api/v1/batch/${jobId}/svd-plot`;
    fetch(url, { method: "HEAD" })
      .then((res) => setAvailable(res.ok))
      .catch(() => setAvailable(false));
  }, [jobId]);

  if (available === null) {
    return <p className="text-sm text-slate-500">Prüfe Plot-Verfügbarkeit …</p>;
  }

  if (!available) {
    return <p className="text-sm text-slate-500">SVD-Plot ist derzeit nicht verfügbar.</p>;
  }

  return (
    <img
      src={`/api/v1/batch/${jobId}/svd-plot`}
      alt="SVD Plot"
      className="mt-3 w-full rounded-3xl border border-slate-200 bg-white object-contain"
      loading="lazy"
    />
  );
}
