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

function mixHex(from: string, to: string, amount: number): string {
  const channel = (hex: string, index: number) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return `#${[0, 1, 2]
    .map((index) => Math.round(channel(from, index) * (1 - amount) + channel(to, index) * amount))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * SIG-1192: coordinate label colours per theme. The library default is a
 * fixed brown/cream pair (about 2:1 on most themes). Light squares take the
 * theme's dark colour pushed 35% toward black (3.9–7.1:1 across themes);
 * dark squares take the light colour pushed 60% toward white (2.4–4.8:1,
 * the most a mid-tone square allows without pure white glare).
 */
export function boardNotationStyles(theme: BoardTheme): {
  light: { color: string };
  dark: { color: string };
} {
  const colors = BOARD_THEMES[isBoardTheme(theme) ? theme : "studio"];
  return {
    light: { color: mixHex(colors.dark, "#000000", 0.35) },
    dark: { color: mixHex(colors.light, "#ffffff", 0.6) },
  };
}
