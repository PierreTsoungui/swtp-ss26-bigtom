import {Accordion, AccordionDetails, AccordionSummary, Stack, Switch, TextField, Typography} from "@mui/material";
import type {SnpFilterType} from "../utils/types.ts";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {FILTER_CONSTRAINTS, validateFilterValue} from "../utils/filterValidation.ts";
import React from "react";


type SnpFilterProps = {
    value: SnpFilterType;
    onChange: (updated : SnpFilterType) => void;
}

function SnpFilter({value, onChange} : SnpFilterProps) {
    const constraints = FILTER_CONSTRAINTS.snp.maf_cutoff;
    const validation = validateFilterValue(value.maf_cutoff, constraints.min, constraints.max);


    const handleMafCutoffChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = Number(e.target.value);
        const clampedValue = Math.max(constraints.min, Math.min(newValue, constraints.max));
        onChange({...value, maf_cutoff: clampedValue});
    }

    return (
        <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
                <div className="flex items-center justify-between w-full">

                    <div>
                        <Typography sx={{fontWeight: 600}}>
                            SNP Filter
                        </Typography>
                    </div>

                    <Switch
                        checked={value.enabled}
                        onChange={(e) => onChange({...value, enabled: e.target.checked})}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            </AccordionSummary>

            <AccordionDetails>
                <Stack spacing={2}>
                    <TextField
                        type="number"
                        label={constraints.label}
                        value={value.maf_cutoff}
                        onChange={handleMafCutoffChange}
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

export default SnpFilter;