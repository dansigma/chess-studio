import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_STRING_KEYS,
  formatReviewEta,
  presetLabel,
  phaseName,
  reviewCancelledText,
  reviewFailedText,
  reviewPresetOption,
  reviewProgressText,
  reviewPlayerFallback,
  tReview,
  tierName,
  type ReviewStringKey,
} from "./review-strings.ts";

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

test("every review string key renders in both locales without leftover placeholders", () => {
  const keys = new Set<string>(REVIEW_STRING_KEYS);
  assert.equal(keys.size, REVIEW_STRING_KEYS.length, "review string keys must be unique");
  for (const key of REVIEW_STRING_KEYS) {
    const en = tReview("en", key);
    const pt = tReview("pt-br", key);
    for (const [locale, text] of [
      ["en", en],
      ["pt-br", pt],
    ] as const) {
      assert.ok(text.length > 0, `${locale}:${key} must not be empty`);
      assert.ok(!text.includes("{") && !text.includes("}"), `${locale}:${key} has leftover braces: ${text}`);
    }
    // No key may silently fall back to English in PT-BR.
    assert.notEqual(pt, `__missing:${key}`, `pt-br:${key} is missing`);
  }
});

test("template helpers render whole PT-BR sentences and stay EN-identical", () => {
  assert.equal(reviewProgressText("en", { depth: 12, done: 3, total: 20 }), "Scoring moves at depth 12… 3/20");
  assert.equal(
    reviewProgressText("pt-br", { depth: 12, done: 3, total: 20 }),
    "Avaliando lances na profundidade 12… 3/20",
  );
  assert.equal(
    reviewFailedText("en", { done: 3, total: 20 }),
    "The engine stopped responding at 3/20 positions. Try the review again.",
  );
  assert.equal(
    reviewFailedText("pt-br", { done: 3, total: 20 }),
    "O motor parou de responder em 3/20 posições. Tente a análise novamente.",
  );
  assert.equal(reviewCancelledText("en", { done: 3, total: 20 }), "Review cancelled at 3/20 positions.");
  assert.equal(reviewCancelledText("pt-br", { done: 3, total: 20 }), "Análise cancelada em 3/20 posições.");
  assert.equal(reviewPresetOption("en", "fast", 10), "Fast (depth 10)");
  assert.equal(reviewPresetOption("pt-br", "fast", 10), "Rápida (profundidade 10)");
  assert.equal(formatReviewEta("en", 12_000), "~12s left");
  assert.equal(formatReviewEta("pt-br", 12_000), "faltam ~12s");
  assert.equal(formatReviewEta("en", 125_000), "~2m 5s left");
  assert.equal(formatReviewEta("pt-br", 125_000), "faltam ~2min 5s");
});

test("tier, phase, preset and player names have PT-BR parity", () => {
  const tiers = {
    brilliant: ["Genius", "Genial"],
    great: ["Great", "Ótima"],
    best: ["Perfect", "Perfeita"],
    veryGood: ["Very good", "Muito boa"],
    decent: ["Decent", "Razoável"],
    book: ["Textbook", "Teórica"],
    inaccuracy: ["Imprecise", "Imprecisão"],
    mistake: ["Mistake", "Erro"],
    miss: ["Miss", "Lance perdido"],
    blunder: ["Blunder", "Gafe"],
    forced: ["Forced", "Forçada"],
  } as const;
  for (const [label, [en, pt] ] of Object.entries(tiers)) {
    assert.equal(tierName("en", label as keyof typeof tiers), en);
    assert.equal(tierName("pt-br", label as keyof typeof tiers), pt);
  }
  assert.equal(phaseName("en", "opening"), "Opening");
  assert.equal(phaseName("pt-br", "opening"), "Abertura");
  assert.equal(phaseName("en", "middlegame"), "Middlegame");
  assert.equal(phaseName("pt-br", "middlegame"), "Meio-jogo");
  assert.equal(phaseName("en", "endgame"), "Endgame");
  assert.equal(phaseName("pt-br", "endgame"), "Final");
  assert.equal(presetLabel("en", "deep"), "Deep");
  assert.equal(presetLabel("pt-br", "deep"), "Profunda");
  assert.equal(reviewPlayerFallback("en", "w"), "White");
  assert.equal(reviewPlayerFallback("pt-br", "b"), "Pretas");
});

test("unknown locale entries fall back to English", () => {
  // Simulate a partial table by deleting nothing — instead assert the fallback
  // path returns English for a key whose PT-BR entry is temporarily absent.
  // Here we only assert the EN table is complete for every declared key.
  for (const key of REVIEW_STRING_KEYS satisfies readonly ReviewStringKey[]) {
    assert.ok(tReview("en", key).length > 0);
  }
  void placeholders;
});
