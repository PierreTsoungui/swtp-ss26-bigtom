import type { TableFilters } from "../hooks/useTableFilters";

type Props = {
  filters: TableFilters;

  onChange: (
    filters: TableFilters
  ) => void;

  onApply: () => void;
  onReset: () => void;
};

export function TableFilters({
  filters,
  onChange,
  onApply,
  onReset,
}: Props) {
  const hasFilters =
    filters.chromosome ||
    filters.start ||
    filters.stop ||
    filters.dmrId ||
    filters.pValue ||
    filters.adjPValue;
  return (
    <div className="mb-4 flex gap-3 flex-wrap">

      <select
        value={filters.chromosome}
        onChange={(e) =>
          onChange({
            ...filters,
            chromosome: e.target.value,
          })
        }
        className="border p-2 rounded"
      >
        <option value="">
          Chromosome
        </option>

        {Array.from(
          { length: 22 },
          (_, i) => i + 1
        ).map((chr) => (
          <option
            key={chr}
            value={String(chr)}
          >
            chr{chr}
          </option>
        ))}

        <option value="X">chrX</option>
        <option value="Y">chrY</option>
      </select>

      {filters.chromosome && (
        <>
          <input
            type="number"
            placeholder="Start"
            value={filters.start}
            onChange={(e) =>
              onChange({
                ...filters,
                start: e.target.value,
              })
            }
            className="border p-2 rounded"
          />

          <input
            type="number"
            placeholder="Stop"
            value={filters.stop}
            onChange={(e) =>
              onChange({
                ...filters,
                stop: e.target.value,
              })
            }
            className="border p-2 rounded"
          />
        </>
      )}

      <input
        type="text"
        placeholder="DMR ID"
        value={filters.dmrId}
        onChange={(e) =>
          onChange({
            ...filters,
            dmrId: e.target.value,
          })
        }
        className="border p-2 rounded"
      />

      <input
        type="number"
        placeholder="P-Value"
        value={filters.pValue}
        onChange={(e) =>
          onChange({
            ...filters,
            pValue: e.target.value,
          })
        }
        className="border p-2 rounded"
      />

      <input
        type="number"
        placeholder="Adjusted P-Value"
        value={filters.adjPValue}
        onChange={(e) =>
          onChange({
            ...filters,
            adjPValue: e.target.value,
          })
        }
        className="border p-2 rounded"
      />

     <button
        onClick={onApply}
        disabled={!hasFilters}
        className="px-4 py-2 border rounded"
    >
        Apply
    </button>

      <button
        onClick={onReset}
        className="px-4 py-2 border rounded"
      >
        Reset
      </button>
    </div>
  );
}