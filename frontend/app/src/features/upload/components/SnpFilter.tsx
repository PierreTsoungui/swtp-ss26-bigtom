import {Accordion, AccordionDetails, AccordionSummary, Stack, Switch, TextField, Typography} from "@mui/material";
import type {SnpFilterType} from "../utils/types.ts";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";


type SnpFilterProps = {
    value: SnpFilterType;
    onChange: (updated : SnpFilterType) => void;
}

function SnpFilter({value, onChange} : SnpFilterProps) {
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
                        label="Minor Allele Frequency (MAF)"
                        value={value.maf_cutoff}
                        onChange={(e) => onChange({...value, maf_cutoff: Number(e.target.value)})}
                        size="small"
                        fullWidth
                        disabled={!value.enabled}
                    />
                </Stack>
            </AccordionDetails>
        </Accordion>
    );
}

export default SnpFilter;