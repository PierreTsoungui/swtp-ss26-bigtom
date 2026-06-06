



import { Accordion, AccordionDetails, AccordionSummary, Switch, TextField, Typography, Stack } from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type {SampleQualityFilterType} from "../utils/types.ts";

type SampleQualityProps = {
    value: SampleQualityFilterType;
    onChange: (updated: SampleQualityFilterType) => void;
}

export function SampleQuality({ value, onChange }: SampleQualityProps) {
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
                        label="Detection P-Cutoff Filter"
                        value={value.detection_p_cutoff}
                        onChange={(e) => onChange({ ...value, detection_p_cutoff: Number(e.target.value) })}
                        size="small"
                        fullWidth
                        disabled={!value.enabled}
                    />
                    <TextField
                        type="number"
                        label="Sample Failure Rate Filter"
                        value={value.sample_failure_rate}
                        onChange={(e) => onChange({ ...value, sample_failure_rate: Number(e.target.value) })}
                        size="small"
                        fullWidth
                        disabled={!value.enabled}
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