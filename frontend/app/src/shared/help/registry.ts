import uploadBody from "./content/upload.md?raw";
import filteringBody from "./content/filtering.md?raw";
import normalizationBody from "./content/normalization.md?raw";
import batchCorrectionBody from "./content/batchCorrection.md?raw";
import dmpBody from "./content/dmp.md?raw";
import dmrBody from "./content/dmr.md?raw";
import tableExportBody from "./content/tableExport.md?raw";
import heatmapBody from "./content/heatmap.md?raw";

/**
 * A single contextual help topic.
 *
 * The {@link HelpTopic.body} is authored as Markdown in its own file under
 * `content/` and rendered with {@link HelpContent}. Adding a new help text means
 * dropping a new `*.md` file into `content/` and registering it here — nothing
 * else in the UI needs to change.
 */
export interface HelpTopic {
    /** Title shown in the dialog header. */
    title: string;
    /** Markdown source rendered as the dialog body. */
    body: string;
}

/**
 * Central registry of every help topic in the workflow.
 *
 * Keyed by a stable topic id that components reference via
 * `<HelpButton topic="..." />`.
 */
export const helpTopics = {
    upload: {
        title: "Upload Raw Data & Sample Information",
        body: uploadBody,
    },
    filtering: {
        title: "Quality Filtering",
        body: filteringBody,
    },
    normalization: {
        title: "Normalization",
        body: normalizationBody,
    },
    batchCorrection: {
        title: "Batch Effects & Batch Correction",
        body: batchCorrectionBody,
    },
    dmp: {
        title: "DMP Analysis",
        body: dmpBody,
    },
    dmr: {
        title: "DMR Analysis",
        body: dmrBody,
    },
    tableExport: {
        title: "Exporting Results",
        body: tableExportBody,
    },
    heatmap: {
        title: "Heatmap Interpretation",
        body: heatmapBody,
    },
} satisfies Record<string, HelpTopic>;

/** Union of all valid help topic ids. */
export type HelpTopicId = keyof typeof helpTopics;
