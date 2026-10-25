import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  annotationRows,
  counterpartNag,
  isMoveEvalNag,
  notationMenuEnablement,
  resolveSideNag,
  shouldIgnoreMenuScroll,
} from "./NotationContextMenu.tsx";

test("notationMenuEnablement disables text-before/promote/make-mainline at start", () => {
  const enabled = notationMenuEnablement({
    pathLength: 0,
    canPromote: false,
    canMakeMainline: false,
    setupMode: false,
    hasNags: false,
    hasMoveNag: false,
  });
  assert.equal(enabled.textAfter.disabled, false);
  assert.deepEqual(enabled.textBefore, { disabled: true, reason: "At start" });
  assert.deepEqual(enabled.promote, { disabled: true, reason: "At start" });
  assert.deepEqual(enabled.makeMainline, { disabled: true, reason: "At start" });
  assert.equal(enabled.deleteVariation.disabled, false);
  assert.equal(enabled.cutAfter.disabled, false);
  assert.equal(enabled.insertNull.disabled, false);
  assert.equal(enabled.clearEval.disabled, true);
  assert.equal(enabled.clearAll.disabled, true);
});

test("notationMenuEnablement disables promote/make-mainline with Mainline reason on mainline", () => {
  const enabled = notationMenuEnablement({
    pathLength: 1,
    canPromote: false,
    canMakeMainline: false,
    setupMode: false,
    hasNags: false,
    hasMoveNag: false,
  });
  assert.equal(enabled.textBefore.disabled, false);
  assert.deepEqual(enabled.promote, { disabled: true, reason: "Mainline" });
  assert.deepEqual(enabled.makeMainline, { disabled: true, reason: "Mainline" });
});

test("notationMenuEnablement enables variation actions and gates insert-null in setup mode", () => {
  const enabled = notationMenuEnablement({
    pathLength: 2,
    canPromote: true,
    canMakeMainline: true,
    setupMode: false,
    hasNags: true,
    hasMoveNag: true,
  });
  assert.equal(enabled.promote.disabled, false);
  assert.equal(enabled.makeMainline.disabled, false);
  assert.equal(enabled.clearEval.disabled, false);
  assert.equal(enabled.clearAll.disabled, false);

  const setup = notationMenuEnablement({
    pathLength: 2,
    canPromote: true,
    canMakeMainline: true,
    setupMode: true,
    hasNags: true,
    hasMoveNag: true,
  });
  assert.deepEqual(setup.insertNull, { disabled: true, reason: "In setup mode" });
});

test("notationMenuEnablement separates move-eval clear from clear-all", () => {
  // Position-only glyphs: Clear all enabled, None (clearEval) disabled.
  const positionOnly = notationMenuEnablement({
    pathLength: 1,
    canPromote: false,
    canMakeMainline: false,
    setupMode: false,
    hasNags: true,
    hasMoveNag: false,
  });
  assert.equal(positionOnly.clearAll.disabled, false);
  assert.equal(positionOnly.clearEval.disabled, true);
});

test("resolveSideNag picks the white/black NAG from the move color", () => {
  assert.equal(resolveSideNag("w", 36, 37), 36);
  assert.equal(resolveSideNag("b", 36, 37), 37);
  assert.equal(resolveSideNag("w", 132, 133), 132);
  assert.equal(resolveSideNag("b", 138, 139), 139);
});

test("counterpartNag maps white/black pairs symmetrically", () => {
  for (const [white, black] of [
    [36, 37],
    [40, 41],
    [44, 45],
    [130, 131],
    [132, 133],
    [134, 135],
    [136, 137],
    [138, 139],
  ] as const) {
    assert.equal(counterpartNag(white), black);
    assert.equal(counterpartNag(black), white);
  }
  assert.equal(counterpartNag(1), undefined);
  assert.equal(counterpartNag(10), undefined);
  assert.equal(counterpartNag(140), undefined);
});

test("isMoveEvalNag matches the None-row clear scope", () => {
  for (const nag of [1, 2, 3, 4, 5, 6]) {
    assert.equal(isMoveEvalNag(nag), true);
  }
  for (const nag of [10, 13, 22, 32, 36, 44, 132, 140, 146]) {
    assert.equal(isMoveEvalNag(nag), false);
  }
});

test("annotationRows keeps move/position order and resolves side pairs by color", () => {
  for (const color of ["w", "b"] as const) {
    const rows = annotationRows(color);
    const move = rows.filter((row) => row.group === "move").map((row) => row.nag);
    assert.deepEqual(move, [3, 1, 5, 6, 2, 4]);
    const position = rows.filter((row) => row.group === "position").map((row) => row.nag);
    assert.deepEqual(position, [10, 13, 14, 15, 16, 17, 18, 19]);
    for (const row of rows) {
      assert.ok(row.glyph.length > 0, `row ${row.key} needs a glyph`);
      assert.ok(!row.glyph.startsWith("$"), `row ${row.key} should not fall back to $N`);
      assert.ok(row.label.length > 0, `row ${row.key} needs a label`);
    }
  }
  const white = new Map(annotationRows("w").map((row) => [row.key, row.nag]));
  const black = new Map(annotationRows("b").map((row) => [row.key, row.nag]));
  assert.equal(white.get("pair-initiative"), 36);
  assert.equal(black.get("pair-initiative"), 37);
  assert.equal(white.get("pair-attack"), 40);
  assert.equal(black.get("pair-attack"), 41);
  assert.equal(white.get("pair-compensation"), 44);
  assert.equal(black.get("pair-compensation"), 45);
  assert.equal(white.get("pair-counterplay-moderate"), 132);
  assert.equal(black.get("pair-counterplay-moderate"), 133);
  assert.equal(white.get("pair-time-severe"), 138);
  assert.equal(black.get("pair-time-severe"), 139);
  assert.equal(white.get("nag-140"), 140);
  assert.equal(white.get("nag-146"), 146);
});

test("shouldIgnoreMenuScroll ignores internal scrolls, keeps outside-scroll dismiss", () => {
  const inside = { tag: "submenu-scroll-container" };
  const outside = { tag: "notation-list" };
  const root = {
    contains(node: unknown) {
      return node === inside;
    },
  };
  // Scroll from the annotation submenu's own overflow list: ignored.
  assert.equal(shouldIgnoreMenuScroll(inside, root), true);
  // Scroll from the notation list behind the menu: still dismisses.
  assert.equal(shouldIgnoreMenuScroll(outside, root), false);
  // Null root (menu unmounted) or null/non-object targets: never ignore.
  assert.equal(shouldIgnoreMenuScroll(inside, null), false);
  assert.equal(shouldIgnoreMenuScroll(null, root), false);
  assert.equal(shouldIgnoreMenuScroll(undefined, root), false);
  assert.equal(shouldIgnoreMenuScroll("scroll", root), false);
});

test("notation context menu keeps the approved item order, shortcuts, and overlay tier", () => {
  const source = readFileSync(new URL("./NotationContextMenu.tsx", import.meta.url), "utf8");
  const order = [
    "notation.menu.textAfter",
    "notation.menu.textBefore",
    "notation.menu.annotation",
    "notation.menu.promote",
    "notation.menu.makeMainline",
    "notation.menu.deleteVariation",
    "notation.menu.cutAfter",
    "notation.menu.insertNull",
  ];
  let cursor = -1;
  for (const key of order) {
    const next = source.indexOf(key);
    assert.ok(next > cursor, `${key} should follow menu order`);
    cursor = next;
  }
  for (const shortcut of ["Ctrl+A", "Ctrl+Shift+A", "Ctrl+↑", "Ctrl+Shift+↑", "Ctrl+Del"]) {
    assert.ok(source.includes(shortcut), `menu should hint ${shortcut}`);
  }
  assert.ok(source.includes('shortcut="Del"'), "cut-after should hint Del");
  assert.ok(source.includes("z-[1100]"), "menu should use z-[1100] like BoardContextMenu");
  assert.ok(
    source.includes("notation.menu.moveActions"),
    "menu should label the Move actions region",
  );
  assert.ok(
    source.includes('data-annotation-submenu="true"'),
    "annotation submenu should be marked for keyboard nav",
  );
  assert.ok(source.includes("right-full"), "submenu should flip left near the right edge");
  assert.ok(
    source.includes("notation.menu.clearAll"),
    "submenu should offer Clear all glyphs",
  );
});
