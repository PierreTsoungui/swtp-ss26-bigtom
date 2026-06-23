import {Accordion, AccordionDetails, AccordionSummary, Switch, TextField, Typography, Stack} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type {DetPFilterType} from "../utils/types.ts";
import {clampValue, FILTER_CONSTRAINTS, validateFilterValue} from "../utils/filterValidation.ts";
import React from "react";

type DetPValueFilterProps = {
    value: DetPFilterType;
    onChange: (updated: DetPFilterType) => void;
}

export function DetPValueFilter({ value, onChange }: DetPValueFilterProps) {
    const constraints = FILTER_CONSTRAINTS.det_p.cutoff;
    const validation = validateFilterValue(value.cutoff, constraints.min, constraints.max);

    const handleCutoffChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = Number(e.target.value);
        // Wert clampen statt zu verbieten
        const clampedValue = clampValue(newValue, constraints.min, constraints.max);
        onChange({ ...value, cutoff: clampedValue });
    };

    return (
        <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <div className="flex items-center justify-between w-full">
                    <Typography sx={{ fontWeight: 600 }}>
                        Detection P-Value Filter
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
                        value={value.cutoff}
                        onChange={handleCutoffChange}
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
                    {/*<Box sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                        Valid: {constraints.min} - {constraints.max}
                    </Box>*/}
                </Stack>
            </AccordionDetails>
        </Accordion>
    );
}