import { describe, expect, it } from "vitest";

import { colors } from "./colors";

describe("WCAG color tokens", () => {
  it("provides the primary, secondary and tertiary colors", () => {
    expect(colors.primary).toEqual({
      DEFAULT: "#1A6FA8",
      hover: "#125280",
      text: "#FFFFFF",
    });
    expect(colors.secondary).toEqual({
      DEFAULT: "#3D5A80",
      hover: "#2C3F5C",
      text: "#FFFFFF",
    });
    expect(colors.tertiary).toEqual({
      DEFAULT: "#5C7B8A",
      hover: "#435C68",
      text: "#FFFFFF",
    });
  });

  it("provides semantic status colors and badge variants", () => {
    expect(colors.success).toEqual({
      DEFAULT: "#1E7D4E",
      hover: "#155C38",
      text: "#FFFFFF",
      badgeBackground: "#DCFCE7",
      badgeText: "#155C38",
    });
    expect(colors.warning).toEqual({
      DEFAULT: "#B45309",
      hover: "#8A3F07",
      text: "#FFFFFF",
      badgeBackground: "#FEF3C7",
      badgeText: "#8A3F07",
    });
    expect(colors.danger).toEqual({
      DEFAULT: "#B91C1C",
      hover: "#8B1313",
      text: "#FFFFFF",
      badgeBackground: "#FEE2E2",
      badgeText: "#8B1313",
    });
    expect(colors.error).toBe(colors.danger);
    expect(colors.info).toEqual({
      DEFAULT: "#0E6BAB",
      hover: "#094E7E",
      text: "#FFFFFF",
      badgeBackground: "#DBEAFE",
      badgeText: "#094E7E",
    });
  });

  it("provides the neutral application palette", () => {
    expect(colors.neutral).toEqual({
      textPrimary: "#0F172A",
      textSecondary: "#475569",
      textDisabled: "#94A3B8",
      background: "#F8FAFC",
      surface: "#F1F5F9",
      card: "#FFFFFF",
      borderDefault: "#E2E8F0",
      borderEmphasis: "#CBD5E1",
    });
  });
});
