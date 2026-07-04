const white = "#FFFFFF";

const danger = {
  DEFAULT: "#B91C1C",
  hover: "#8B1313",
  text: white,
  badgeBackground: "#FEE2E2",
  badgeText: "#8B1313",
} as const;

/**
 * Global color palette and theme configuration.
 *
 * Includes brand colors, semantic status colors (success, warning, error),
 * and neutral tones for typography and layout surfaces.
 */
export const colors = {
  /** Main brand colors for primary actions and highlights. */
  primary: {
    DEFAULT: "#1A6FA8",
    hover: "#125280",
    text: white,
  },
  /** Secondary brand colors for alternative actions. */
  secondary: {
    DEFAULT: "#3D5A80",
    hover: "#2C3F5C",
    text: white,
  },
  /** Tertiary colors for subtle UI elements. */
  tertiary: {
    DEFAULT: "#5C7B8A",
    hover: "#435C68",
    text: white,
  },
  /** Semantic colors indicating successful operations or positive states. */
  success: {
    DEFAULT: "#1E7D4E",
    hover: "#155C38",
    text: white,
    badgeBackground: "#DCFCE7",
    badgeText: "#155C38",
  },
  /** Semantic colors for cautionary information or pending actions. */
  warning: {
    DEFAULT: "#B45309",
    hover: "#8A3F07",
    text: white,
    badgeBackground: "#FEF3C7",
    badgeText: "#8A3F07",
  },
  /** Semantic colors for destructive actions or critical errors. */
  danger,
  /** Alias for {@link colors.danger}. */
  error: danger,
  /** Semantic colors for general information or callouts. */
  info: {
    DEFAULT: "#0E6BAB",
    hover: "#094E7E",
    text: white,
    badgeBackground: "#DBEAFE",
    badgeText: "#094E7E",
  },
  /**
   * Functional neutral tones for UI structure.
   * Used for text hierarchies, backgrounds, cards, and borders.
   */
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

/** Type definition based on the global color palette. */
export type ThemeColors = typeof colors;
