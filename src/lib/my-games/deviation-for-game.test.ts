// SIG-1093: fixtures built from small PGNs; both trees come from `importPgn`
// so the tests exercise the real import shape.
import assert from "node:assert/strict";
import test from "node:test";
import { importPgn } from "@/src/chess/pgn.ts";
import type { GameTree } from "@/src/chess/tree.ts";
import type { DeviationEvent } from "@/src/chess/repertoire-deviation.ts";
import { deviationBadgeText, deviationForGame, deviationReviewText } from "./deviation-for-game.ts";

function treeFromPgn(pgn: string): GameTree {
  const imported = importPgn(pgn);
  assert.equal(imported.warnings.length, 0, `PGN failed to import: ${imported.warnings}`);
  return imported.tree;
}

const WHITE_REP = treeFromPgn("1. e4 e5 2. Nf3 Nc6 *\n");
const BLACK_REP = treeFromPgn("1. e4 c5 2. Nf3 d6 *\n");

function eventFor(pgn: string, color: "white" | "black", repertoireTree: GameTree | null = WHITE_REP) {
  return deviationForGame({ pgn, color, repertoireTree });
}

test("null repertoire returns null for both colors", () => {
  assert.equal(eventFor("1. e4 e5 2. Nf3 *\n", "white", null), null);
  assert.equal(eventFor("1. e4 e5 2. Nf3 *\n", "black", null), null);
});

test("missing, empty, or unparseable PGN returns null", () => {
  assert.equal(deviationForGame({ pgn: undefined, color: "white", repertoireTree: WHITE_REP }), null);
  assert.equal(deviationForGame({ pgn: null, color: "white", repertoireTree: WHITE_REP }), null);
  assert.equal(deviationForGame({ pgn: "   ", color: "white", repertoireTree: WHITE_REP }), null);
  assert.equal(deviationForGame({ pgn: "not a game", color: "white", repertoireTree: WHITE_REP }), null);
});

test("a white user deviation returns the event and badge sentences", () => {
  const event = eventFor("1. e4 e5 2. Bc4 *\n", "white");
  assert.equal(event?.kind, "user_deviation");
  assert.equal(deviationBadgeText("en", event), "Left your repertoire at 2. Bc4");
  assert.equal(deviationBadgeText("pt-br", event), "Você saiu do repertório em 2. Bc4");
});

test("a white opponent novelty returns the gap badge", () => {
  const event = eventFor("1. e4 c5 2. Nf3 *\n", "white");
  assert.equal(event?.kind, "opponent_gap");
  assert.equal(deviationBadgeText("en", event), "Opponent novelty at 1…c5");
  assert.equal(deviationBadgeText("pt-br", event), "Novidade do adversário em 1…c5");
});

test("a black user deviation is attributed to the black side", () => {
  const event = eventFor("1. e4 c5 2. Nf3 d5 *\n", "black", BLACK_REP);
  assert.equal(event?.kind, "user_deviation");
  assert.equal(deviationBadgeText("en", event), "Left your repertoire at 2…d5");
});

test("a white novelty against a black repertoire is an opponent gap", () => {
  const event = eventFor("1. d4 d5 *\n", "black", BLACK_REP);
  assert.equal(event?.kind, "opponent_gap");
  assert.equal(deviationBadgeText("en", event), "Opponent novelty at 1. d4");
});

test("line_ended renders the static badge, none/never_entered render nothing", () => {
  const ended = eventFor("1. e4 e5 2. Nf3 *\n", "white", treeFromPgn("1. e4 e5 *\n"));
  assert.equal(ended?.kind, "line_ended");
  assert.equal(deviationBadgeText("en", ended), "Line ended");
  assert.equal(deviationBadgeText("pt-br", ended), "Linha encerrada");
  assert.equal(deviationReviewText("en", ended), null);

  const inside = eventFor("1. e4 e5 *\n", "white", treeFromPgn("1. e4 e5 2. Nf3 *\n"));
  assert.deepEqual(inside, { kind: "none" });
  assert.equal(deviationBadgeText("en", inside), null);
  assert.equal(deviationReviewText("en", inside), null);
  assert.equal(deviationBadgeText("en", null), null);
  assert.equal(deviationReviewText("en", null), null);
});

test("review line covers both kinds in both locales", () => {
  const user: DeviationEvent = {
    kind: "user_deviation",
    ply: 3,
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    playedUci: "f8c5",
    playedSan: "Bc5",
    repertoireMoves: [{ uci: "b8c6", san: "Nc6" }],
  };
  assert.equal(
    deviationReviewText("en", user),
    "You left your repertoire at 2…Bc5; your line is 2…Nc6",
  );
  assert.equal(
    deviationReviewText("pt-br", user),
    "Você saiu do repertório em 2…Bc5; sua linha é 2…Nc6",
  );

  const gap: DeviationEvent = {
    kind: "opponent_gap",
    ply: 2,
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    playedUci: "c7c5",
    playedSan: "c5",
    repertoireMoves: [{ uci: "e7e5", san: "e5" }],
  };
  assert.equal(deviationReviewText("en", gap), "Your repertoire has no answer to 1…c5");
  assert.equal(deviationReviewText("pt-br", gap), "Seu repertório não tem resposta para 1…c5");
});

test("review user line with no repertoire moves renders nothing", () => {
  const event: DeviationEvent = {
    kind: "user_deviation",
    ply: 3,
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    playedUci: "f8c5",
    playedSan: "Bc5",
    repertoireMoves: [],
  };
  assert.equal(deviationReviewText("en", event), null);
});
