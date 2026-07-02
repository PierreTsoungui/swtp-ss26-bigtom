import type {MultiHitFilterType} from "../../utils/types.ts";
import {Accordion, AccordionSummary, Switch, Typography} from "@mui/material";
import * as React from "react";

/**
 * Props for the MultiHitFilter component.
 */
type MultiHitFilterProps = {
    /** The current configuration for the multi-hit filtering logic. */
    value: MultiHitFilterType;
    /** Callback fired when the filter is enabled or disabled. */
    onChange: (updated: MultiHitFilterType) => void;
}

/**
 * A UI component to toggle the Multi-Hit Filter.
 *
 * This component is rendered as a non-expandable Accordion to maintain
 * visual consistency with other filter panels that have additional settings.
 */
function MultiHitFilter({value, onChange} : MultiHitFilterProps) {
    return (
        <Accordion expanded={false} slots={{ transition: React.Fragment}}>
            <AccordionSummary expandIcon={<div style={{ width: 24, height: 24}}> </div>}>
                <div className="flex items-center justify-between w-full">

                    <div>
                        <Typography sx={{ fontWeight: 600 }}>
                            Multi-Hit Filter
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

export default MultiHitFilter;