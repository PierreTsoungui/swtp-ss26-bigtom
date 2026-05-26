import type { JobStatusValue } from "../analysis/utils/types";

interface BatchStatusProps {
  status: string | undefined;
  phase: string | undefined;
  currentStep: string | undefined;
  error: string | null;
  jobStatus: JobStatusValue | undefined;
}

export function BatchStatus({ status, phase, currentStep, error, jobStatus }: BatchStatusProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Job-Status</p>
          <p className="mt-1 text-xs text-slate-500">Aktueller Status: {jobStatus ?? "unbekannt"}</p>
        </div>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">{status ?? "idle"}</span>
      </div>

      <div className="mt-4 space-y-2 text-sm text-slate-700">
        <p><strong>Phase:</strong> {phase ?? "-"}</p>
        <p><strong>Schritt:</strong> {currentStep ?? "Warte auf Benutzereingaben"}</p>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Fehler</p>
          <p>{error}</p>
        </div>
      ) : null}
    </div>
  );
}
