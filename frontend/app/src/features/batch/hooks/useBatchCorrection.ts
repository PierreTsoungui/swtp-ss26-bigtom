import { useState } from "react";

export function useBatchCorrection(jobId: string) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function startCorrection(batchVariable: string, covariates: string[]) {
    setStatus("running");
    setError(null);

    const res = await fetch(`/api/v1/batch/${jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_variable: batchVariable, covariates }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.detail?.message ?? "Fehler beim Starten der Batch-Korrektur");
      setStatus("error");
      return;
    }

    // Polling bis batch_done oder failed
    const interval = setInterval(async () => {
      const statusRes = await fetch(`/api/v1/status/${jobId}`);
      const statusData = await statusRes.json();

      if (statusData.status === "batch_done") {
        clearInterval(interval);
        setStatus("done");
      } else if (statusData.status === "failed") {
        clearInterval(interval);
        setError(statusData.error_message ?? "Batch-Korrektur fehlgeschlagen");
        setStatus("error");
      }
    }, 2000);
  }

  async function skipCorrection() {
    await fetch(`/api/v1/batch/${jobId}/skip`, { method: "POST" });
    setStatus("done");
  }

  return { status, error, startCorrection, skipCorrection };
}