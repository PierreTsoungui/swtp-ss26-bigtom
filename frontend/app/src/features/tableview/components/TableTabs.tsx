import HelpButton from "../../../shared/help/HelpButton";

type Props = {
  activeTab: "dmp" | "dmr";
  onChange: (tab: "dmp" | "dmr") => void;
};
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
          topic={activeTab}
          ariaLabel={activeTab === "dmp" ? "Open DMP analysis help" : "Open DMR analysis help"}
        />

      </div>
    </div>
  );
}