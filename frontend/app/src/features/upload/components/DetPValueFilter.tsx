import { Accordion, AccordionDetails, AccordionSummary, Switch, TextField, Typography, Stack } from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type {DetPFilterType} from "../utils/types.ts";

type DetPValueFilterProps = {
    value: DetPFilterType;
    onChange: (updated: DetPFilterType) => void;
}

export function DetPValueFilter({ value, onChange }: DetPValueFilterProps) {
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
                        label="Cutoff"
                        value={value.cutoff}
                        onChange={(e) => onChange({ ...value, cutoff: Number(e.target.value) })}
                        size="small"
                        fullWidth
                        disabled={!value.enabled}
                    />
                </Stack>
            </AccordionDetails>
        </Accordion>
    );
}