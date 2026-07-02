import type {XYChromosomesFilterType} from "../../utils/types.ts";
import {Accordion, AccordionSummary, Switch, Typography} from "@mui/material";
import * as React from "react";

/**
 * Props for the XYChromosomesFilter component.
 */
type XYChromosomesFilterProps = {
    /** The current configuration for sex chromosome filtering. */
    value: XYChromosomesFilterType;
    /** Callback fired when the filter is enabled or disabled. */
    onChange: (updated: XYChromosomesFilterType) => void;
}
/**
 * UI toggle for the Sex Chromosome (XY) Filter.
 *
 * Removes probes located on chromosomes X and Y to prevent sex-specific bias.
 * Rendered as a static Accordion for layout consistency.
 */
function XYChromosomesFilter({value, onChange} : XYChromosomesFilterProps) {
    return (
        <Accordion expanded={false} slots={{ transition: React.Fragment}}>
            <AccordionSummary expandIcon={<div style={{ width: 24, height: 24}}> </div>}>
                <div className="flex items-center justify-between w-full">

                    <div>
                        <Typography sx={{ fontWeight: 600 }}>
                            XY-Chromosomes Filter
                        </Typography>
                    </div>

                    <Switch
                        checked={value.enabled}
                        onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            </AccordionSummary>
        </Accordion>
    );
}

export default XYChromosomesFilter;