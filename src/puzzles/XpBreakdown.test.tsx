import assert from "node:assert/strict";
import test from "node:test";
import { xpBreakdownText } from "./XpBreakdown";

test("xpBreakdownText renders the sum in English", () => {
  assert.equal(
    xpBreakdownText("en", {
      base: 20,
      factors: [
        { key: "difficulty", value: 1.4 },
        { key: "speed", value: 1.5 },
      ],
      total: 42,
    }),
    "+42 XP · 20 solved × 1.4 hard × 1.5 fast",
  );
});

test("xpBreakdownText renders pt-BR with decimal commas and every label", () => {
  assert.equal(
    xpBreakdownText("pt-br", {
      base: 20,
      factors: [
        { key: "difficulty", value: 0.7 },
        { key: "speed", value: 1.25 },
        { key: "firstTry", value: 1.2 },
      ],
      total: 21,
    }),
    "+21 XP · 20 resolvido × 0,7 fácil × 1,25 rápido × 1,2 de primeira",
  );
});

test("xpBreakdownText explains a missed puzzle", () => {
  const missed = { base: 0, factors: [], total: 0 };
  assert.equal(xpBreakdownText("en", missed), "+0 XP · No XP for a missed puzzle");
  assert.equal(xpBreakdownText("pt-br", missed), "+0 XP · Sem XP por um problema errado");
});
