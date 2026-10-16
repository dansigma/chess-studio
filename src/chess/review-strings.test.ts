import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_STRING_KEYS,
  TABLES,
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

test("every review string key renders in both locales with matching placeholders", () => {
  const keys = new Set<string>(REVIEW_STRING_KEYS);
  assert.equal(keys.size, REVIEW_STRING_KEYS.length, "review string keys must be unique");
  for (const key of REVIEW_STRING_KEYS) {
    // No silent EN fallback: the pt-br table itself must define every key.
    const ptRaw = TABLES["pt-br"]?.[key];
    assert.ok(
      typeof ptRaw === "string" && ptRaw.length > 0,
      `pt-br:${key} is missing from the table (would silently fall back to English)`,
    );
    const en = tReview("en", key);
    const pt = tReview("pt-br", key);
    for (const [locale, text] of [
      ["en", en],
      ["pt-br", pt],
    ] as const) {
      assert.ok(text.length > 0, `${locale}:${key} must not be empty`);
    }
    const enPlaceholders = (en.match(/\{([^}]+)\}/g) ?? []).sort();
    const ptPlaceholders = (pt.match(/\{([^}]+)\}/g) ?? []).sort();
    assert.deepEqual(
      ptPlaceholders,
      enPlaceholders,
      `placeholders mismatch between EN and PT-BR for "${key}"`,
    );
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
  assert.equal(formatReviewEta("pt-br", 12_000), "~12s restantes");
  assert.equal(formatReviewEta("en", 125_000), "~2m 05s left");
  assert.equal(formatReviewEta("pt-br", 125_000), "~2m 05s restantes");
  assert.equal(
    reviewProgressText("pt-br", { depth: 12, done: 1234, total: 2450 }),
    "Avaliando lances na profundidade 12… 1.234/2.450",
  );
});

test("tier, phase, preset and player names have PT-BR parity", () => {
  const tiers = {
    brilliant: ["Genius", "Genial"],
    great: ["Great", "Ótimo"],
    best: ["Perfect", "Perfeito"],
    veryGood: ["Very good", "Muito bom"],
    decent: ["Decent", "Razoável"],
    book: ["Textbook", "Teórico"],
    inaccuracy: ["Imprecise", "Imprecisão"],
    mistake: ["Mistake", "Erro"],
    miss: ["Miss", "Perda"],
    blunder: ["Blunder", "Capivarada"],
    forced: ["Forced", "Forçado"],
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
  // The EN table must be complete for every declared key so the
  // tReview() fallback path always has English to return.
  for (const key of REVIEW_STRING_KEYS satisfies readonly ReviewStringKey[]) {
    assert.ok(tReview("en", key).length > 0);
  }
});
