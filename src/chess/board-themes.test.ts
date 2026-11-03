import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_THEME_IDS, boardNotationStyles } from "./board-themes.ts";

test("boardNotationStyles derives readable coordinate colours from the theme", () => {
  assert.deepEqual(boardNotationStyles("studio"), {
    light: { color: "#4f6574" },
    dark: { color: "#e8ecef" },
  });
  for (const theme of BOARD_THEME_IDS) {
    const styles = boardNotationStyles(theme);
    assert.match(styles.light.color, /^#[0-9a-f]{6}$/u);
    assert.match(styles.dark.color, /^#[0-9a-f]{6}$/u);
  }
});

test("boardNotationStyles falls back to the studio theme for unknown ids", () => {
  assert.deepEqual(boardNotationStyles("nope" as never), boardNotationStyles("studio"));
});
