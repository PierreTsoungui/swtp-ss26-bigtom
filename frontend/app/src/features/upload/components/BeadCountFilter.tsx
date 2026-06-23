import { Accordion, AccordionDetails, AccordionSummary, Switch, TextField, Typography, Stack } from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type {BeadCountFilterType} from "../utils/types.ts";
import {FILTER_CONSTRAINTS, validateFilterValue} from "../utils/filterValidation.ts";
import React from "react";

type BeadCountFilterProps = {
    value: BeadCountFilterType;
    onChange: (updated: BeadCountFilterType) => void;
}

export function BeadCountFilter({ value, onChange }: BeadCountFilterProps) {
    const constraints = FILTER_CONSTRAINTS.bead_count.bead_cutoff;
    const validation = validateFilterValue(value.bead_cutoff, constraints.min, constraints.max);

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