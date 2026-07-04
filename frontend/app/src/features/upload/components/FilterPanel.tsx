import {
    type BeadCountFilterType,
    DEFAULT_FILTER_SETTINGS,
    type DetPFilterType,
    type FilterSettings,
    type MultiHitFilterType,
    type NonCpgFilterType,
    type SampleQualityFilterType,
    type SnpFilterType,
    type XYChromosomesFilterType,
} from "../utils/types.ts";
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    IconButton,
    Tooltip,
    Typography,
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {DetPValueFilter} from "./FilterComponents/DetPValueFilter.tsx";
import {BeadCountFilter} from "./FilterComponents/BeadCountFilter.tsx";
import NonCpgFilter from "./FilterComponents/NonCpgFilter.tsx";
import SnpFilter from "./FilterComponents/SnpFilter.tsx";
import MultiHitFilter from "./FilterComponents/MultiHitFilter.tsx";
import XYChromosomesFilter from "./FilterComponents/XYChromosomesFilter.tsx";
import {SampleQuality} from "./FilterComponents/SampleQuality.tsx";
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import HelpButton from "../../../shared/help/HelpButton.tsx";

/**
 * Props for the FilterPanel component.
 */
type FilterPanelProps = {
    /** The current configuration for all analysis filters. */
    filterSettings: FilterSettings;
    /** Callback fired when any individual filter setting is updated. */
    onFilterSettingsChange: (settings: FilterSettings) => void;
};

/**
 * A centralized control panel for configuring preprocessing and quality control filters.
 *
 * It provides a grouped accordion interface to toggle and fine-tune specific
 * bioinformatics filters (e.g., P-Value, SNP, Sample Quality).
 *
 * @remarks
 * All state updates are handled immutably to ensure compatibility with
 * React's rendering cycle and the `useUploadFlow` state machine.
 */
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
                bead_count: updated,
            },
        });
    };

    const handleNonCpgChange = (updated: NonCpgFilterType) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                non_cpg: updated,
            },
        });
    };

    const handleSnpChange = (updated: SnpFilterType) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                snp: updated,
            },
        });
    };

    const handleMultiHitChange = (updated: MultiHitFilterType) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                multi_hit: updated,
            },
        });
    };

    const handleXYChromosomesChange = (updated: XYChromosomesFilterType) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                xy_chromosomes: updated,
            },
        });
    };

    const handleSampleQualityChange = (updated: SampleQualityFilterType) => {
        onFilterSettingsChange({
            ...filterSettings,
            filter_settings: {
                ...filterSettings.filter_settings,
                sample_quality: updated,
            },
        });
    };

    return (
        <div className="max-w-4/6 mx-auto mt-2">
            <div className="mb-2 flex items-center gap-2">
                <h2 className="text-lg font-semibold">Quality Filtering</h2>
                <HelpButton topic="filtering" ariaLabel="Open filtering help" />
            </div>
            <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="filter-settings-content" id="filter-settings-header">
                    <div className={"flex items-center justify-between w-full"}>
                        <Typography>
                            Customize filter settings (optional)
                        </Typography>
                        <Tooltip title="Reset to default settings">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onFilterSettingsChange(structuredClone(DEFAULT_FILTER_SETTINGS));
                                }}
                            >
                                <RestartAltIcon />
                            </IconButton>
                        </Tooltip>
                    </div>
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
