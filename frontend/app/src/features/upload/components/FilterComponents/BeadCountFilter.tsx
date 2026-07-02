import { Accordion, AccordionDetails, AccordionSummary, Switch, TextField, Typography, Stack } from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type {BeadCountFilterType} from "../../utils/types.ts";
import {FILTER_CONSTRAINTS, validateFilterValue} from "../../utils/filterValidation.ts";
import React from "react";

/**
 * Props for the BeadCountFilter component.
 */
type BeadCountFilterProps = {
    /** The current configuration for the bead count filtering logic. */
    value: BeadCountFilterType;
    /** Callback fired when the filter state or its cutoff value changes. */
    onChange: (updated: BeadCountFilterType) => void;
}

/**
 * A UI component to configure the Bead Count Filter.
 * It allows users to enable/disable the filter and set a cutoff value for bead counts.
 *
 * The component implements automatic value clamping to ensure the `bead_cutoff`
 * remains within the scientifically valid range defined in {@link FILTER_CONSTRAINTS}.
 */
export function BeadCountFilter({ value, onChange }: BeadCountFilterProps) {
    const constraints = FILTER_CONSTRAINTS.bead_count.bead_cutoff;
    const validation = validateFilterValue(value.bead_cutoff, constraints.min, constraints.max);

    /** Updates the bead cutoff value while ensuring it stays within defined boundaries.*/
    const handleBeadCutoffChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = Number(e.target.value);
        const clampedValue = Math.max(constraints.min, Math.min(newValue, constraints.max));
        onChange({ ...value, bead_cutoff: clampedValue });
    }

    return (
        <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <div className="flex items-center justify-between w-full">
                    <Typography sx={{ fontWeight: 600 }}>
                        Bead Count Filter
                    </Typography>
                    <Switch
                        checked={value.enabled}
                        onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            </AccordionSummary>

            <AccordionDetails>
                <Stack spacing={2}>
                    <TextField
                        type="number"
                        label={constraints.label}
                        value={value.bead_cutoff}
                        onChange={handleBeadCutoffChange}
                        size="small"
                        fullWidth
                        disabled={!value.enabled}
                        slotProps={{
                            htmlInput: {
                                step: constraints.step,
                                min: constraints.min,
                                max: constraints.max
                            }
                        }}
                        error={!validation.isValid}
                        helperText={validation.error || constraints.description}
                    />
                </Stack>
            </AccordionDetails>
        </Accordion>
    );
}