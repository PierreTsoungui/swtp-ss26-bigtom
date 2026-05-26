import { Accordion, AccordionDetails, AccordionSummary, Switch, TextField, Typography, Stack } from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type {BeadCountFilterType} from "../utils/types.ts";

type BeadCountFilterProps = {
    value: BeadCountFilterType;
    onChange: (updated: BeadCountFilterType) => void;
}

export function BeadCountFilter({ value, onChange }: BeadCountFilterProps) {
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
                        label="Sample Fraction"
                        value={value.bead_cutoff}
                        onChange={(e) => onChange({ ...value, bead_cutoff: Number(e.target.value) })}
                        size="small"
                        fullWidth
                        disabled={!value.enabled}
                    />
                </Stack>
            </AccordionDetails>
        </Accordion>
    );
}