import type { ChangeEvent } from "react";

interface BatchFormProps {
  batchVariable: string;
  covariates: string;
  onBatchVariableChange: (value: string) => void;
  onCovariatesChange: (value: string) => void;
  onStart: () => void;
  onSkip: () => void;
  submitLabel: string;
  skipLabel: string;
  disabled: boolean;
  isSubmitting: boolean;
  isReadyForBatch: boolean;
}

export function BatchForm({
  batchVariable,
  covariates,
  onBatchVariableChange,
  onCovariatesChange,
  onStart,
  onSkip,
  submitLabel,
  skipLabel,
  disabled,
  isSubmitting,
  isReadyForBatch,
}: BatchFormProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 rounded-2xl bg-slate-50 p-4">
        <p className="text-sm text-slate-600">
          Bitte wählen Sie hier die Batch-Variable und geben Sie biologische Kovariaten an.
        </p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-900">Batch-Variable</span>
          <input
            type="text"
            value={batchVariable}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onBatchVariableChange(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Slide"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-900">Kovariaten</span>
          <textarea
            value={covariates}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onCovariatesChange(event.target.value)}
            className="mt-2 min-h-[110px] w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Sample_Group, Sex, Age"
          />
          <p className="mt-2 text-xs text-slate-500">
            Kommagetrennte Liste biologischer Spalten, die nicht entfernt werden dürfen.
          </p>
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onStart}
          disabled={disabled}
          className="rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSubmitting ? "Wird gestartet..." : submitLabel}
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={!isReadyForBatch || isSubmitting}
          className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
        >
          {skipLabel}
        </button>
      </div>
    </div>
  );
}
