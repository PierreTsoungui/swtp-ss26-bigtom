import {
    type BeadCountFilterType,
    type DetPFilterType,
    type FilterSettings, type MultiHitFilterType,
    type NonCpgFilterType, type SampleQualityFilterType, type SnpFilterType, type XYChromosomesFilterType
} from "../utils/types.ts";
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Typography
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {DetPValueFilter} from "./DetPValueFilter.tsx";
import {BeadCountFilter} from "./BeadCountFilter.tsx";
import NonCpgFilter from "./NonCpgFilter.tsx";
import SnpFilter from "./SnpFilter.tsx";
import MultiHitFilter from "./MultiHitFilter.tsx";
import XYChromosomesFilter from "./XYChromosomesFilter.tsx";
import {SampleQuality} from "./SampleQuality.tsx";

type FilterPanelProps = {
    filterSettings: FilterSettings;
    onFilterSettingsChange: (settings: FilterSettings) => void;
}

function FilterPanel({ filterSettings, onFilterSettingsChange }: FilterPanelProps) {


    const handleDetPChange = (updated: DetPFilterType) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                det_p: updated,
            },
        });
    };

    const handleBeadCountChange = (updated: BeadCountFilterType) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                bead_count: updated
            }
        })
    }

    const handleNonCpgChange = (updated: NonCpgFilterType) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                non_cpg: updated
            }
        })
    }

    const handleSnpChange = (updated: SnpFilterType) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                snp: updated
            }
        })
    }
    const handleMultiHitChange = (updated: MultiHitFilterType) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                multi_hit: updated
            }
        })
    }

    const handleXYChromosomesChange = (updated: XYChromosomesFilterType) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                xy_chromosomes: updated
            }
        })
    }

    const handleSampleQualityChange = (updated: SampleQualityFilterType) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                sample_quality: updated
            }
        })
    }

    return (
        <div className="max-w-4/6 mx-auto mt-2">
            <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="filter-settings-content" id="filter-settings-header">
                    <Typography>
                        Filtereinstellungen anpassen (optional)
                    </Typography>
                </AccordionSummary>

                <AccordionDetails>
                    <DetPValueFilter value={filterSettings.filter_settings.det_p} onChange={handleDetPChange} />
                    <BeadCountFilter value={filterSettings.filter_settings.bead_count} onChange={handleBeadCountChange} />
                    <NonCpgFilter value={filterSettings.filter_settings.non_cpg} onChange={handleNonCpgChange} />
                    <SnpFilter value={filterSettings.filter_settings.snp} onChange={handleSnpChange} />
                    <MultiHitFilter value={filterSettings.filter_settings.multi_hit} onChange={handleMultiHitChange} />
                    <XYChromosomesFilter value={filterSettings.filter_settings.xy_chromosomes} onChange={handleXYChromosomesChange} />
                    <SampleQuality value={filterSettings.filter_settings.sample_quality} onChange={handleSampleQualityChange} />
                </AccordionDetails>
            </Accordion>
        </div>
    );
}

export default FilterPanel;