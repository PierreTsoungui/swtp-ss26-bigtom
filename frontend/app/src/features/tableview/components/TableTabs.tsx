import HelpButton from "../../analysis/components/HelpButton";
import { helpTexts } from "../../../shared/utils/help/helpTexts";

/**
 * Props for the TableTabs component.
 */
type Props = {
  /** The currently active results view. */
  activeTab: "dmp" | "dmr";
  /** Callback fired when the user switches between DMP and DMR views. */
  onChange: (tab: "dmp" | "dmr") => void;
};

/**
 * A navigation header to toggle between Differentially Methylated Position (DMP)
 * and Region (DMR) result tables.
 *
 * It synchronizes the {@link HelpButton} content based on the selected tab
 * to provide context-specific biological and technical information.
 */
export function TableTabs({ activeTab, onChange }: Props) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-neutral-borderDefault">
      <div className="flex gap-6" role="tablist">  
        <button
          role="tab"  
          aria-selected={activeTab === "dmp"}  
          onClick={() => onChange("dmp")}
          className={`
            px-1 py-3 text-sm font-medium transition-colors
            ${activeTab === "dmp" 
              ? "text-primary border-b-2 border-primary"
              : "text-neutral-textSecondary hover:text-neutral-textPrimary border-b-2 border-transparent"
            }
          `}
        >
          DMP Analysis
        </button>
        <button
          role="tab"  
          aria-selected={activeTab === "dmr"}  
          onClick={() => onChange("dmr")}
          className={`
            px-1 py-3 text-sm font-medium transition-colors
            ${activeTab === "dmr" 
              ? "text-primary border-b-2 border-primary"
              : "text-neutral-textSecondary hover:text-neutral-textPrimary border-b-2 border-transparent"
            }
          `}
        >
          DMR Analysis
        </button>
      </div>
      <div className="pb-2">
        <HelpButton
          helpText={activeTab === "dmp" ? helpTexts.dmp : helpTexts.dmr}
          ariaLabel={`Open help for ${activeTab.toUpperCase()} analysis`}
          dialogTitle={activeTab === "dmp" ? "DMP Analysis" : "DMR Analysis"}
        />
      </div>
    </div>
  );
}