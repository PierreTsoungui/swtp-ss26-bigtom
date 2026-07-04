/**
 * Validation constraints for filter input fields.
 * These boundaries are aligned with the technical requirements defined in `types.ts`.
 */
export const FILTER_CONSTRAINTS = {
    det_p: {
        cutoff: {
            min: 0.01,
            max: 0.05,
            step: 0.001,
            label: "Detection P-Value Cutoff",
            description: "Area: 0.01 - 0.05",
        },
    },
    bead_count: {
        bead_cutoff: {
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: "Bead Cutoff",
            description: "Area: 0.0 - 1.0",
        },
    },
    snp: {
        maf_cutoff: {
            min: 0.0,
            max: 0.5,
            step: 0.01,
            label: "Minor Allele Frequency (MAF) Cutoff",
            description: "Area: 0.0 - 0.5",
        },
    },
    sample_quality: {
        detection_p_cutoff: {
            min: 0.01,
            max: 0.05,
            step: 0.001,
            label: "Detection P-Value Cutoff",
            description: "Area: 0.01 - 0.05",
        },
        sample_failure_rate: {
            min: 0.05,
            max: 0.2,
            step: 0.01,
            label: "Sample Failure Rate",
            description: "Area: 5% - 20%",
        },
    },
};

/**
 * Validates a numerical value against defined minimum and maximum boundaries.
 *
 * @param value - The input value to validate.
 * @param min - The lower boundary.
 * @param max - The upper boundary.
 * @returns An object indicating validity and an optional error message.
 */
export function validateFilterValue(
    value: number,
    min: number,
    max: number
): { isValid: boolean; error?: string } {
    if (value < min) {
        return {
            isValid: false,
            error: `Wert muss mindestens ${min} sein`,
        };
    }
    if (value > max) {
        return {
            isValid: false,
            error: `Wert darf höchstens ${max} sein`,
        };
    }
    return { isValid: true };
}

/**
 * Restricts a value to a defined range by returning the nearest boundary
 * if the value is out of bounds.
 *
 * @param value - The value to be restricted.
 * @param min - The minimum allowed value.
 * @param max - The maximum allowed value.
 * @returns The clamped numerical value.
 */
export function clampValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}