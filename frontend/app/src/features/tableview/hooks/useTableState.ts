import { useState } from "react";

export function useTableState() {
  const [activeTab, setActiveTab] =
    useState<"dmp" | "dmr">("dmp");

  return {
    activeTab,
    setActiveTab,
  };
}