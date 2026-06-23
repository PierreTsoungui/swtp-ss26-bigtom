



import { Accordion, AccordionDetails, AccordionSummary, Switch, TextField, Typography, Stack } from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type {SampleQualityFilterType} from "../utils/types.ts";
import {FILTER_CONSTRAINTS, validateFilterValue} from "../utils/filterValidation.ts";
import React from "react";

type SampleQualityProps = {
    value: SampleQualityFilterType;
    onChange: (updated: SampleQualityFilterType) => void;
}

/*
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
 */

export function SampleQuality({ value, onChange }: SampleQualityProps) {
    const constraints_fail_rate = FILTER_CONSTRAINTS.sample_quality.sample_failure_rate;
    const constraints_det_p_cutoff = FILTER_CONSTRAINTS.sample_quality.detection_p_cutoff;

    const validationDetectionPCutoff = validateFilterValue(value.detection_p_cutoff, constraints_det_p_cutoff.min, constraints_det_p_cutoff.max);
    const validationSampleFailureRate = validateFilterValue(value.sample_failure_rate, constraints_fail_rate.min, constraints_fail_rate.max);

    const handleDetectionPCutoffChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = Number(e.target.value);
        const clampedValue = Math.max(constraints_det_p_cutoff.min, Math.min(newValue, constraints_det_p_cutoff.max));
        onChange({ ...value, detection_p_cutoff: clampedValue });
    }
    const handleSampleFailureRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = Number(e.target.value);
        const clampedValue = Math.max(constraints_fail_rate.min, Math.min(newValue, constraints_fail_rate.max));
        onChange({ ...value, sample_failure_rate: clampedValue });
    }

    return (
        <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <div className="flex items-center justify-between w-full">
                    <Typography sx={{ fontWeight: 600 }}>
                       Sample Quality
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
                        label={constraints_det_p_cutoff.label}
                        value={value.detection_p_cutoff}
                        onChange={handleDetectionPCutoffChange}
                        size="small"
                        fullWidth
                        disabled={!value.enabled}
                        slotProps={{
                            htmlInput: {
                                step: constraints_det_p_cutoff.step,
                                min: constraints_det_p_cutoff.min,
                                max: constraints_det_p_cutoff.max,
                            }
                        }}
                        error={!validationDetectionPCutoff.isValid}
                        helperText={validationDetectionPCutoff.error || constraints_det_p_cutoff.description}
                    />
                    <TextField
                        type="number"
                        label={constraints_fail_rate.label}
                        value={value.sample_failure_rate}
                        onChange={handleSampleFailureRateChange}
                        size="small"
                        fullWidth
                        disabled={!value.enabled}
                        slotProps={{
                            htmlInput: {
                                step: constraints_fail_rate.step,
                                min: constraints_fail_rate.min,
                                max: constraints_fail_rate.max
                            }
                        }}
                        error={!validationSampleFailureRate.isValid}
                        helperText={validationSampleFailureRate.error || constraints_fail_rate.description}
                    />
                </Stack>
                <div className="flex items-center justify-between w-full">
                        <Typography sx={{ fontWeight: 600 }}>
                            Remove Failed Samples
                        </Typography>
                        <Switch
                            checked={value.remove_failed_samples}
                            onChange={(e) => onChange({ ...value, remove_failed_samples: e.target.checked })}
                            disabled={!value.enabled}
                        />
                </div>

                <div className="flex items-center justify-between w-full">
                        <Typography sx={{ fontWeight: 600 }}>
                            Enable PCA Outlier Detection
                        </Typography>
                        <Switch
                            checked={value.enable_pca_outlier_detection}
                            onChange={(e) => onChange({ ...value, enable_pca_outlier_detection: e.target.checked })}
                            disabled={!value.enabled}
                        />
                </div>

            </AccordionDetails>
        </Accordion>
    );
}