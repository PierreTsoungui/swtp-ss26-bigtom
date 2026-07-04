import type { RoleKey } from "../utils/uploadApi";

/**
 * Represents the user's mapping of canonical roles to specific sheet columns.
 */
export type RoleSelection = Record<RoleKey, string | null>;

/**
 * Props for the ColumnRoleMapper component.
 */
interface Props {
  /** All available column headers from the parsed sample sheet. */
  columns: string[];
  /** The current state of role assignments. */
  mapping: RoleSelection;
  /** Callback fired when a role is assigned or cleared. */
  onChange: (role: RoleKey, value: string | null) => void;
  /** Whether the dropdowns are interactive. */
  disabled?: boolean;
}

/**
 * Internal definition for a required metadata role.
 */
interface RoleDef {
    /** The unique key identifying the role in the backend. */
    key: RoleKey;
    /** Human-readable label for the UI. */
    label: string;
    /** Descriptive guidance on the role's purpose. */
    hint: string;
}

/**
 * The four required role assignments. Sample sheets from different databases use
 * wildly different column names, so the user maps which raw column carries each
 * canonical role the analysis depends on (Sentrix_ID/Position locate the IDATs;
 * Sample_Group is the biological grouping; Sample_Name identifies a sample).
 */
const ROLES: RoleDef[] = [
  { key: "sentrix_id", label: "Sentrix_ID", hint: "Chip barcode — used to locate the IDAT files." },
  { key: "sentrix_position", label: "Sentrix_Position", hint: "Position on the chip (e.g. R01C01)." },
  { key: "sample_group", label: "Sample_Group", hint: "Biological group (case / control)." },
  { key: "sample_name", label: "Sample_Name", hint: "Identifier for each sample." },
];

/**
 * A specialized interface for mapping canonical analysis roles to CSV/Excel columns.
 *
 * To ensure data integrity, selections are **mutually exclusive**: once a column
 * is assigned to a role, it is hidden from other dropdowns. This prevents the
 * same column from being mapped to multiple roles simultaneously.
 */
function ColumnRoleMapper({ columns, mapping, onChange, disabled = false }: Props) {
      /**
       * Calculates the set of columns already assigned to other roles.
       * This is used to filter out unavailable options in the current dropdown.
      */
      const usedElsewhere = (role: RoleKey): Set<string> =>
        new Set(
          ROLES.filter((r) => r.key !== role)
            .map((r) => mapping[r.key])
            .filter((v): v is string => v !== null),
        );

      return (
        <div>
          <h3 className="mb-1 font-semibold text-neutral-textPrimary">
            Column roles <span className="text-danger">*</span>
          </h3>
          <p className="mb-3 text-sm text-neutral-textSecondary">
            Assign each required role to a column from the selected sample sheet.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {ROLES.map((role) => {
              const taken = usedElsewhere(role.key);
              const current = mapping[role.key];
              // A column is offered if it is free, or it is this role's own choice.
              const options = columns.filter((c) => !taken.has(c) || c === current);
              return (
                <label key={role.key} className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-neutral-textPrimary">{role.label}</span>
                  <select
                    value={current ?? ""}
                    disabled={disabled || columns.length === 0}
                    onChange={(e) => onChange(role.key, e.target.value || null)}
                    aria-label={`Column for ${role.label}`}
                    className={`rounded-lg border bg-neutral-card px-3 py-2 text-sm ${
                      current ? "border-neutral-borderDefault" : "border-warning"
                    } disabled:opacity-60`}
                  >
                    <option value="">— select column —</option>
                    {options.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-neutral-textSecondary">{role.hint}</span>
                </label>
              );
            })}
          </div>
        </div>
      );
}


export default ColumnRoleMapper;
