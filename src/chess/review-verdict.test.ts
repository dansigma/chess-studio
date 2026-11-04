// SIG-1207: pure verdict line for the review summary.
import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewVerdict, turningPoint, type VerdictRow } from "./review-verdict.ts";
import type { ReviewReport, SideReport } from "./review-report.ts";
import { START_FEN } from "./tree.ts";

function side(name: string, accuracy: number | null): SideReport {
  return { name, accuracy } as SideReport;
}

function report(white = side("White", 68.2), black = side("Black", 67)): ReviewReport {
  return { white, black };
}

function row(overrides: Partial<VerdictRow> & { plies: number }): VerdictRow {
  const { plies, ...rest } = overrides;
  return {
    path: Array.from({ length: plies }, () => 0),
    san: "e4",
    side: plies % 2 === 1 ? "w" : "b",
    label: null,
    winLoss: 0,
    lossCp: 0,
    ...rest,
  };
}

const rows: VerdictRow[] = [
  row({ plies: 3, label: "mistake", winLoss: 12, lossCp: 150, san: "Nf3" }),
  row({ plies: 27, label: "blunder", winLoss: 41, lossCp: 420, san: "Bxf7" }),
  row({ plies: 30, label: "inaccuracy", winLoss: 60, lossCp: 600, san: "Qd2" }),
];

const base = { moveNotation: "english" as const, startFen: START_FEN };

test("turningPoint picks the largest win-chance swing among blunders and mistakes only", () => {
  assert.equal(turningPoint(rows)?.san, "Bxf7");
  assert.equal(turningPoint([row({ plies: 1, label: "inaccuracy", winLoss: 30 })]), null);
  assert.equal(turningPoint([]), null);
});

test("turningPoint breaks win-chance ties by lossCp, then keeps the earlier move", () => {
  const a = row({ plies: 5, label: "mistake", winLoss: 20, lossCp: 200, san: "a" });
  const b = row({ plies: 9, label: "blunder", winLoss: 20, lossCp: 300, san: "b" });
  const c = row({ plies: 11, label: "blunder", winLoss: 20, lossCp: 300, san: "c" });
  assert.equal(turningPoint([a, b, c])?.san, "b");
});

test("EN verdict: both sides, locale-formatted, move number and annotation", () => {
  assert.equal(
    buildReviewVerdict("en", { ...base, report: report(), rows }),
    "White 68.2%, Black 67.0%. The game turned on move 14 (Bxf7??).",
  );
});

test("PT-BR verdict: decimal comma, localized colors and sentence", () => {
  assert.equal(
    buildReviewVerdict("pt-br", { ...base, report: report(), rows }),
    "Brancas 68,2%, pretas 67,0%. A partida virou no lance 14 (Bxf7??).",
  );
});

test("a mistake is annotated with a single question mark and black moves use the full-move number", () => {
  const text = buildReviewVerdict("en", {
    ...base,
    report: report(),
    rows: [row({ plies: 8, label: "mistake", winLoss: 15, san: "Qh4" })],
  });
  assert.equal(text, "White 68.2%, Black 67.0%. The game turned on move 4 (Qh4?).");
});

test("move notation setting applies to the move", () => {
  const text = buildReviewVerdict("en", { ...base, moveNotation: "german", report: report(), rows });
  assert.match(text ?? "", /move 14 \(Lxf7\?\?\)/);
});

test("real player names replace the color; placeholders and empty names keep it", () => {
  assert.equal(
    buildReviewVerdict("en", { ...base, report: report(side("Ana Silva", 80), side("?", 70)), rows }),
    "Ana Silva 80.0%, Black 70.0%. The game turned on move 14 (Bxf7??).",
  );
  assert.equal(
    buildReviewVerdict("pt-br", { ...base, report: report(side("Pretas", 80), side("Bruno", 70)), rows }),
    "Brancas 80,0%, Bruno 70,0%. A partida virou no lance 14 (Bxf7??).",
  );
});

test("no key mistakes gives the clean-game line, still with accuracy", () => {
  const clean = [row({ plies: 3, label: "inaccuracy", winLoss: 8 }), row({ plies: 4, label: "best" })];
  assert.equal(
    buildReviewVerdict("en", { ...base, report: report(), rows: clean }),
    "White 68.2%, Black 67.0%. Clean game: no mistakes or blunders.",
  );
  assert.equal(
    buildReviewVerdict("pt-br", { ...base, report: report(), rows: [] }),
    "Brancas 68,2%, pretas 67,0%. Partida limpa: sem erros ou capivaradas.",
  );
});

test("a partial preview has no verdict", () => {
  assert.equal(buildReviewVerdict("en", { ...base, report: report(), rows, partial: true }), null);
});

test("a side with null accuracy is omitted; both null leaves only the sentence", () => {
  assert.equal(
    buildReviewVerdict("en", { ...base, report: report(side("White", null), side("Black", 67)), rows }),
    "Black 67.0%. The game turned on move 14 (Bxf7??).",
  );
  assert.equal(
    buildReviewVerdict("en", { ...base, report: report(side("White", 68.2), side("Black", null)), rows }),
    "White 68.2%. The game turned on move 14 (Bxf7??).",
  );
  assert.equal(
    buildReviewVerdict("en", { ...base, report: report(side("White", null), side("Black", null)), rows }),
    "The game turned on move 14 (Bxf7??).",
  );
});
