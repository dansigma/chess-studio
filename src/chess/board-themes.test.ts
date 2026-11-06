import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_THEME_IDS, COORDINATE_STYLE, boardCoordinateOptions, boardNotationStyles } from "./board-themes.ts";

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

test("boardCoordinateOptions returns all four coordinate options for a theme", () => {
  const notation = boardNotationStyles("studio");
  assert.deepEqual(boardCoordinateOptions("studio"), {
    lightSquareNotationStyle: notation.light,
    darkSquareNotationStyle: notation.dark,
    alphaNotationStyle: COORDINATE_STYLE,
    numericNotationStyle: COORDINATE_STYLE,
  });
  for (const theme of BOARD_THEME_IDS) {
    assert.deepEqual(Object.keys(boardCoordinateOptions(theme)).sort(), [
      "alphaNotationStyle",
      "darkSquareNotationStyle",
      "lightSquareNotationStyle",
      "numericNotationStyle",
    ]);
  }
});
