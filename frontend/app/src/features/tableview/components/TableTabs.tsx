type Props = {
  activeTab: "dmp" | "dmr";
  onChange: (tab: "dmp" | "dmr") => void;
};
export function TableTabs({ activeTab, onChange }: Props) {
  return (
    <div className="border-b border-gray-200">
      <div className="flex gap-6" role="tablist">  
        <button
          role="tab"  
          aria-selected={activeTab === "dmp"}  
          onClick={() => onChange("dmp")}
          className={`
            px-1 py-3 text-sm font-medium transition-colors
            ${activeTab === "dmp" 
              ? "text-blue-600 border-b-2 border-blue-600" 
              : "text-gray-500 hover:text-gray-700 border-b-2 border-transparent"
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
              ? "text-blue-600 border-b-2 border-blue-600" 
              : "text-gray-500 hover:text-gray-700 border-b-2 border-transparent"
            }
          `}
        >
          DMR Analysis
        </button>
      </div>
    </div>
  );
}