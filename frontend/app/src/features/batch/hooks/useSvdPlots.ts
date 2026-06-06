import { useEffect, useState } from "react";

export function useSvdPlot(jobId: string | null) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!jobId) {
      setAvailable(null);
      return;
    }

    fetch(`/api/v1/batch/${jobId}/svd-plot`, { method: "HEAD" })
      .then((response) => setAvailable(response.ok))
      .catch(() => setAvailable(false));
  }, [jobId]);

  return available;
}
