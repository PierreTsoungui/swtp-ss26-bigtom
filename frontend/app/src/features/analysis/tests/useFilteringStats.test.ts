import { describe, expect, it } from "vitest";
import { parseFilteringStatsResponse } from "../hooks/useFilteringStats";

describe("parseFilteringStatsResponse", () => {
  it("normalisiert das direkte Backend-Format zu FilteringStats", () => {
    const parsed = parseFilteringStatsResponse({
      total_before: 100,
      steps: [
        { name: "Qualitaetsfilter", removed: 10 },
        { name: "Sample-Fehler", removed: 15 },
      ],
      remaining: 75,
    });

    expect(parsed).toEqual({
      status: "filtering_done",
      filterStats: {
        steps: [
          {
            name: "Qualitaetsfilter",
            probesBefore: 100,
            removed: 10,
            probesAfter: 90,
          },
          {
            name: "Sample-Fehler",
            probesBefore: 90,
            removed: 15,
            probesAfter: 75,
          },
        ],
        finalProbeCount: 75,
      },
    });
  });

  it("akzeptiert das direkte Frontend-Format unveraendert", () => {
    const filterStats = {
      steps: [
        {
          name: "Qualitaetsfilter",
          probesBefore: 100,
          removed: 10,
          probesAfter: 90,
        },
      ],
      finalProbeCount: 90,
    };

    expect(parseFilteringStatsResponse(filterStats)).toEqual({
      status: "filtering_done",
      filterStats,
    });
  });

  it("normalisiert Backend-Format innerhalb der bestehenden Status-Response", () => {
    const parsed = parseFilteringStatsResponse({
      status: "filtering_done",
      filterStats: {
        total_before: 50,
        steps: [{ name: "Sample-Fehler", removed: 5 }],
        remaining: 45,
      },
    });

    expect(parsed).toEqual({
      status: "filtering_done",
      filterStats: {
        steps: [
          {
            name: "Sample-Fehler",
            probesBefore: 50,
            removed: 5,
            probesAfter: 45,
          },
        ],
        finalProbeCount: 45,
      },
    });
  });

  it("setzt probesAfter bei ueberzaehligen entfernten Sonden nicht unter null", () => {
    const parsed = parseFilteringStatsResponse({
      total_before: 10,
      steps: [{ name: "Strenger Filter", removed: 15 }],
      remaining: 0,
    });

    expect(parsed.filterStats?.steps[0]).toMatchObject({
      probesBefore: 10,
      removed: 15,
      probesAfter: 0,
    });
  });
});
