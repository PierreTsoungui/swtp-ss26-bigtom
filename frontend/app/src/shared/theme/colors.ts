const white = "#FFFFFF";

const danger = {
  DEFAULT: "#B91C1C",
  hover: "#8B1313",
  text: white,
  badgeBackground: "#FEE2E2",
  badgeText: "#8B1313",
} as const;

export const colors = {
  primary: {
    DEFAULT: "#1A6FA8",
    hover: "#125280",
    text: white,
  },
  secondary: {
    DEFAULT: "#3D5A80",
    hover: "#2C3F5C",
    text: white,
  },
  tertiary: {
    DEFAULT: "#5C7B8A",
    hover: "#435C68",
    text: white,
  },
  success: {
    DEFAULT: "#1E7D4E",
    hover: "#155C38",
    text: white,
    badgeBackground: "#DCFCE7",
    badgeText: "#155C38",
  },
  warning: {
    DEFAULT: "#B45309",
    hover: "#8A3F07",
    text: white,
    badgeBackground: "#FEF3C7",
    badgeText: "#8A3F07",
  },
  danger,
  error: danger,
  info: {
    DEFAULT: "#0E6BAB",
    hover: "#094E7E",
    text: white,
    badgeBackground: "#DBEAFE",
    badgeText: "#094E7E",
  },
  neutral: {
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textDisabled: "#94A3B8",
    background: "#F8FAFC",
    surface: "#F1F5F9",
    card: white,
    borderDefault: "#E2E8F0",
    borderEmphasis: "#CBD5E1",
  },
} as const;

export type ThemeColors = typeof colors;
