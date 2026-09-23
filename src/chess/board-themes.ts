export const BOARD_THEME_IDS = [
  "studio",
  "grey",
  "brown",
  "green",
  "blue",
  "purple",
  "newspaper",
  "wood",
  "grass",
  "ice",
] as const;

export type BoardTheme = (typeof BOARD_THEME_IDS)[number];

export const BOARD_THEMES: Record<BoardTheme, { label: string; light: string; dark: string }> = {
  studio: { label: "Studio", light: "#c5d0d8", dark: "#7a9bb3" },
  grey: { label: "Grey", light: "#dee3e6", dark: "#8ca2ad" },
  brown: { label: "Brown", light: "#f0d9b5", dark: "#b58863" },
  green: { label: "Green", light: "#eedeb0", dark: "#769656" },
  blue: { label: "Blue", light: "#d9e4f1", dark: "#5d7fa3" },
  purple: { label: "Purple", light: "#e6d5f5", dark: "#7d5a9e" },
  newspaper: { label: "Newspaper", light: "#f5f5f5", dark: "#8a8a8a" },
  wood: { label: "Wood", light: "#e8c99b", dark: "#a67c52" },
  grass: { label: "Grass", light: "#ebecd0", dark: "#6d8f4e" },
  ice: { label: "Ice", light: "#e8f4fc", dark: "#6a9cc3" },
};

export function isBoardTheme(value: unknown): value is BoardTheme {
  return typeof value === "string" && value in BOARD_THEMES;
}

export function boardSquareStyles(theme: BoardTheme): {
  light: { backgroundColor: string };
  dark: { backgroundColor: string };
} {
  const colors = BOARD_THEMES[isBoardTheme(theme) ? theme : "studio"];
  return {
    light: { backgroundColor: colors.light },
    dark: { backgroundColor: colors.dark },
  };
}
