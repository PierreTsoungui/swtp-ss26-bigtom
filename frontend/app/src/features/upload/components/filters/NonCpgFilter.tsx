import type { NonCpgFilterType } from "../../types";
import { Accordion, AccordionSummary, Switch, Typography } from "@mui/material";
import * as React from "react";

/**
 * Props for the NonCpgFilter component.
 */
type NonCpgFilterProps = {
  /** The current configuration for the non-CpG filtering logic. */
  value: NonCpgFilterType;
  /** Callback fired when the filter is enabled or disabled. */
  onChange: (updated: NonCpgFilterType) => void;
};

/**
 * A UI component to toggle the Non-CpG Filter.
 *
 * Rendered as a non-expandable Accordion to match the layout of other filter
 * panels while indicating that no additional sub-settings are available.
 */
function NonCpgFilter({ value, onChange }: NonCpgFilterProps) {
  return (
    <Accordion expanded={false} slots={{ transition: React.Fragment }}>
      <AccordionSummary expandIcon={<div style={{ width: 24, height: 24 }}> </div>}>
        <div className="flex items-center justify-between w-full">
          <div>
            <Typography sx={{ fontWeight: 600 }}>Non-CpG Filter</Typography>
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

export default NonCpgFilter;
