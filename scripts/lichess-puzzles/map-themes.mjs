// scripts/lichess-puzzles/map-themes.mjs
// SIG-1042: map Lichess puzzle theme tags onto the app's 13 PuzzleTheme values.
// Unmapped tags are dropped; a puzzle whose tags map to nothing is skipped
// by the caller. The map is the decided 1:1 subset from the issue — do not
// extend it without a new decision (Lichess tags like "short", "long" or
// "quietMove" have no app equivalent).

const TAG_TO_THEME = {
  mate: "mate",
  mateIn1: "mateIn1",
  mateIn2: "mateIn2",
  fork: "fork",
  pin: "pin",
  skewer: "skewer",
  discoveredAttack: "discoveredAttack",
  backRankMate: "backRank",
  sacrifice: "sacrifice",
  attraction: "attraction",
  endgame: "endgame",
  promotion: "promotion",
  middlegame: "middlegame",
};

/**
 * Map Lichess theme tags to app themes, preserving first-seen order and
 * dropping duplicates and unmapped tags.
 * @param {string[]} lichessTags
 * @returns {string[]}
 */
export function mapThemes(lichessTags) {
  const mapped = [];
  const seen = new Set();
  for (const tag of lichessTags) {
    const theme = TAG_TO_THEME[tag];
    if (theme === undefined || seen.has(theme)) {
      continue;
    }
    seen.add(theme);
    mapped.push(theme);
  }
  return mapped;
}
