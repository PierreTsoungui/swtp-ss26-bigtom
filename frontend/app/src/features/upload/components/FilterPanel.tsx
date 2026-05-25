import { type FilterSettings } from "../utils/types.ts";  // ← FIX: Pfad korrigiert
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Stack,
    Switch,
    TextField,
    Typography
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import * as React from "react";

type FilterPanelProps = {
    filterSettings: FilterSettings;
    onFilterSettingsChange: (settings: FilterSettings) => void;
}

function FilterPanel({ filterSettings, onFilterSettingsChange }: FilterPanelProps) {

    const handleDetPEnabledChange = (enabled: boolean) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                det_p: {
                    ...filterSettings.filter_settings.det_p,
                    enabled,
                },
            },
        });
    };

    const handleDetPCutoffChange = (cutoff: number) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                det_p: {
                    ...filterSettings.filter_settings.det_p,
                    cutoff,
                },
            },
        });
    };

    return (
        <div className="max-w-4/6 mx-auto mt-2">
            <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="filter-settings-content" id="filter-settings-header">
                    <Typography>
                        Filtereinstellungen anpassen (optional)
                    </Typography>
                </AccordionSummary>

                <AccordionDetails>
                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <div className="flex items-center justify-between w-full">

                                <div>
                                    <Typography sx={{ fontWeight: 600 }}>
                                        Detection P-Value Filter
                                    </Typography>
                                </div>

                                <Switch
                                    checked={filterSettings.filter_settings.det_p.enabled}
                                    onChange={(e) => handleDetPEnabledChange(e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </AccordionSummary>

                        <AccordionDetails>
                            <Stack spacing={2}>
                                <TextField
                                    type="number"
                                    label="Cutoff"
                                    value={filterSettings.filter_settings.det_p.cutoff}
                                    onChange={(e) => handleDetPCutoffChange(Number(e.target.value))}
                                    size="small"
                                    fullWidth
                                    disabled={!filterSettings.filter_settings.det_p.enabled}
                                />
                            </Stack>
                        </AccordionDetails>
                    </Accordion>


                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <div className="flex items-center justify-between w-full">

                                <div>
                                    <Typography sx={{ fontWeight: 600 }}>
                                        Beadcount Filter
                                    </Typography>
                                </div>

                                <Switch
                                    checked={filterSettings.filter_settings.det_p.enabled}
                                    onChange={(e) => handleDetPEnabledChange(e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </AccordionSummary>

                        <AccordionDetails>
                            <Stack spacing={2}>
                                <TextField
                                    type="number"
                                    label="Minimum Beads per Sample"
                                    value={filterSettings.filter_settings.det_p.cutoff}
                                    onChange={(e) => handleDetPCutoffChange(Number(e.target.value))}
                                    size="small"
                                    fullWidth
                                    disabled={!filterSettings.filter_settings.det_p.enabled}
                                />
                                <TextField
                                    type="number"
                                    label="Maximum Allowed Failed Samples"
                                    value={filterSettings.filter_settings.det_p.cutoff}
                                    onChange={(e) => handleDetPCutoffChange(Number(e.target.value))}
                                    size="small"
                                    fullWidth
                                    disabled={!filterSettings.filter_settings.det_p.enabled}
                                />
                            </Stack>
                        </AccordionDetails>
                    </Accordion>

                    <Accordion expanded={false} slots={{ transition: React.Fragment}}>
                        <AccordionSummary expandIcon={<div style={{ width: 24, height: 24}}> </div>}>
                            <div className="flex items-center justify-between w-full">

                                <div>
                                    <Typography sx={{ fontWeight: 600 }}>
                                        Non-CpG Filter
                                    </Typography>
                                </div>

                                <Switch
                                    checked={filterSettings.filter_settings.det_p.enabled}
                                    onChange={(e) => handleDetPEnabledChange(e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </AccordionSummary>
                    </Accordion>


                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <div className="flex items-center justify-between w-full">

                                <div>
                                    <Typography sx={{ fontWeight: 600 }}>
                                        SNP Filter
                                    </Typography>
                                </div>

                                <Switch
                                    checked={filterSettings.filter_settings.det_p.enabled}
                                    onChange={(e) => handleDetPEnabledChange(e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </AccordionSummary>

                        <AccordionDetails>
                            <Stack spacing={2}>
                                <TextField
                                    type="number"
                                    label="Minor Allele Frequency (MAF)"
                                    value={filterSettings.filter_settings.det_p.cutoff}
                                    onChange={(e) => handleDetPCutoffChange(Number(e.target.value))}
                                    size="small"
                                    fullWidth
                                    disabled={!filterSettings.filter_settings.det_p.enabled}
                                />
                            </Stack>
                        </AccordionDetails>
                    </Accordion>

                    <Accordion expanded={false} slots={{ transition: React.Fragment}}>
                        <AccordionSummary expandIcon={<div style={{ width: 24, height: 24}}> </div>}>
                            <div className="flex items-center justify-between w-full">

                                <div>
                                    <Typography sx={{ fontWeight: 600 }}>
                                        Multi-hit Filter
                                    </Typography>
                                </div>

                                <Switch
                                    checked={filterSettings.filter_settings.det_p.enabled}
                                    onChange={(e) => handleDetPEnabledChange(e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </AccordionSummary>
                    </Accordion>

                </AccordionDetails>
            </Accordion>
        </div>
    );
}

export default FilterPanel;