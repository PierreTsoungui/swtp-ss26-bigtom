type Props = {
  activeTab: "dmp" | "dmr";
  onChange: (tab: "dmp" | "dmr") => void;
};
export function TableTabs({
  activeTab,
  onChange,
}: Props) {
  return (
    <div
      role="tablist"
      className="flex border-b mb-4"
    >
      <button
        role="tab"
        aria-selected={activeTab === "dmp"}
        className={`px-4 py-2 ${
          activeTab === "dmp"
            ? "border-b-2 border-blue-500 font-semibold"
            : ""
        }`}
        onClick={() => onChange("dmp")}
      >
        DMP Analysis
      </button>

      <button
        role="tab"
        aria-selected={activeTab === "dmr"}
        className={`px-4 py-2 ${
          activeTab === "dmr"
            ? "border-b-2 border-blue-500 font-semibold"
            : ""
        }`}
        onClick={() => onChange("dmr")}
      >
        DMR Analysis
      </button>
    </div>
  );
}