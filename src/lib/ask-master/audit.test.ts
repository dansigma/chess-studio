import assert from "node:assert/strict";
import test from "node:test";
import { Chess, DEFAULT_POSITION } from "chess.js";
import { auditAnswer, extractClaims, replayAnswerPosition, offEngineLines, proseClaims, stripFalse, stripUnknownGames } from "./audit.ts";

test("extracts claims and hides missing, malformed and truncated metadata", () => {
  const claim = { type: "pins", piece: "Re1", target: "e7" };
  assert.deepEqual(extractClaims(`Draft.<claims>${JSON.stringify([claim])}</claims>`), {
    body: "Draft.", claims: [claim],
  });
  for (const text of [
    "Draft.", "Draft.<claims>not JSON</claims>", "Draft.<claims>[{}]</claims>",
    "Draft.<claims>[", "Draft.</claims>",
  ]) {
    assert.deepEqual(extractClaims(text), { body: "Draft.", claims: [] });
  }
});

test("checks the pinning piece, blocked diagonal, defense, hanging piece and threats", () => {
  const position = replayAnswerPosition("4k3/4n3/8/3p1B2/2N5/3P4/8/4R1K1 w - - 0 1", undefined);
  const audit = auditAnswer("", [
    { type: "pins", piece: "Re1", target: "e7" },
    { type: "pins", piece: "Re1", target: "c4" },
    { type: "attacks", piece: "Bf5", target: "c2" },
    { type: "defends", piece: "Pd3", target: "c4" },
    { type: "hanging", piece: "Nc4" },
    { type: "threatens", piece: "d5", target: "c4" },
    { type: "threatens", piece: "d5", target: "e7" },
  ], position);
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.falseClaims.map(({ claim }) => "target" in claim ? claim.target : undefined), ["c4", "c2", "e7"]);
  assert.match(audit.falseClaims[0].truth, /e7/);
});

test("drops the sentence around an illegal line instead of leaving a gap", () => {
  const position = replayAnswerPosition(DEFAULT_POSITION, undefined);
  const body = "### Linha principal\nO engine aponta [[1.e5]] como continuação principal. A avaliação é de igualdade.";
  const audit = auditAnswer(body, [], position);
  assert.deepEqual(audit.illegalLines, ["1.e5"]);
  assert.equal(stripFalse(body, audit), "### Linha principal\nA avaliação é de igualdade.");
  const unclosed = "O engine aponta [[1.e5]] e [[ fica solto. Desenvolva.";
  assert.equal(stripFalse(unclosed, auditAnswer(unclosed, [], position)), "Desenvolva.");
  const note = "O engine aponta [[1.e5]] e a nota [[aberta]]. Desenvolva.";
  assert.equal(stripFalse(note, auditAnswer(note, [], position)), "Desenvolva.");
});

test("checks historical lines only when replay reaches the current board", () => {
  const chess = new Chess();
  chess.move("c4");
  chess.move("e5");
  const position = replayAnswerPosition(chess.fen(), { moves: ["c4", "e5"] });
  const body = "[[1...c5 2.Nf3]] [[2.Nf3]] [[2.Bh8]]";
  assert.deepEqual(auditAnswer(body, [], position).illegalLines, ["2.Bh8"]);
  const divergent = replayAnswerPosition(chess.fen(), { moves: ["d4", "d5"] });
  assert.deepEqual(auditAnswer(body, [], divergent).illegalLines, ["1...c5 2.Nf3", "2.Bh8"]);
  const customFen = "4k3/8/8/8/8/8/8/4K2R w - - 0 23";
  const custom = new Chess(customFen);
  custom.move("Rh2");
  const customPosition = replayAnswerPosition(custom.fen(), { startFen: customFen, moves: ["Rh2"] });
  assert.equal(auditAnswer("[[23.Rh3]]", [], customPosition).ok, true);
});

test("removes whole false sentences and illegal lines while keeping nearby prose and legal lines", () => {
  const position = replayAnswerPosition(DEFAULT_POSITION, undefined);
  const body = "Try [[1.e4 e5]]. The bishop on c1 attacks h6. Develop a knight. [[1.Bh6]]";
  const audit = auditAnswer(body, [{ type: "attacks", piece: "Bc1", target: "h6" }], position);
  assert.equal(stripFalse(body, audit), "Try [[1.e4 e5]]. Develop a knight.");
});

test("rejects the production claim that the d-file is open and strips its sentence", () => {
  const position = replayAnswerPosition("rn1qkb1r/pp2pppp/5n2/2pp1b2/3P1B2/2N1PP2/PPP3PP/R2QKBNR b KQkq - 0 5", undefined);
  const { body, claims } = extractClaims(
    'Os reis ainda não rocaram: o branco está em e1 e o preto em e8, ambos com a coluna d aberta na frente do rei. ' +
    'Desenvolva as peças.<claims>[{"type":"file","file":"d","state":"open"}]</claims>',
  );
  const audit = auditAnswer(body, claims, position);
  assert.equal(audit.ok, false);
  assert.equal(audit.falseClaims[0].truth, "d-file is closed (pawns on d4 and d5).");
  assert.equal(stripFalse(body, audit), "Desenvolva as peças.");
});

test("checks half-open files for the named side on the current board", () => {
  const chess = new Chess();
  const moves = "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5".split(" ");
  for (const move of moves) chess.move(move);
  const position = replayAnswerPosition(chess.fen(), { moves });
  const valid = { type: "file", file: "c", state: "half-open", for: "white" } as const;
  assert.equal(auditAnswer("", [valid], position).ok, true);
  const body = "A coluna de c está semi-aberta para as pretas. Observe a coluna c.";
  const audit = auditAnswer(body, [{ ...valid, for: "black" }], position);
  assert.match(audit.falseClaims[0].truth, /half-open for White/);
  assert.equal(stripFalse(body, audit), "Observe a coluna c.");
});

test("checks pawn traits and castling status and strips false claims in prose", () => {
  const position = replayAnswerPosition("4k3/3p4/8/8/3P4/8/8/4K3 w - - 0 1", undefined);
  assert.equal(auditAnswer("", [
    { type: "pawn", square: "d4", kind: "isolated" },
    { type: "king", side: "white", state: "uncastled" },
  ], position).ok, true);
  const body = "O peão de d4 está isolado. As brancas têm peões dobrados em d4. O rei branco já rocou.";
  const audit = auditAnswer(body, [
    { type: "pawn", square: "d4", kind: "doubled" },
    { type: "king", side: "white", state: "castled" },
  ], position);
  assert.deepEqual(audit.falseClaims.map(({ truth }) => truth), [
    "Pawn traits on d4: isolated.",
    "The white king is uncastled on e1.",
  ]);
  assert.equal(stripFalse(body, audit), "O peão de d4 está isolado.");
});

test("checks a pawn break against the computed targets for its side", () => {
  const chess = new Chess();
  for (const move of ["e4", "e6", "d4", "d5", "e5"]) chess.move(move);
  const position = replayAnswerPosition(chess.fen(), undefined);
  assert.equal(auditAnswer("", [{ type: "break", side: "black", move: "c5" }], position).ok, true);
  const body = "White can use the c5 pawn break. Build pressure on c5.";
  const audit = auditAnswer(body, [{ type: "break", side: "white", move: "c5" }], position);
  assert.equal(audit.ok, false);
  assert.equal(stripFalse(body, audit), "Build pressure on c5.");
});

test("ignores malformed structural claim metadata", () => {
  for (const claim of [
    { type: "file", file: "i", state: "open" },
    { type: "file", file: "c", state: "empty" },
    { type: "file", file: "c", state: "half-open" },
    { type: "file", file: "c", state: "half-open", for: "w" },
    { type: "pawn", square: "d9", kind: "isolated" },
    { type: "pawn", square: "d4", kind: "blocked" },
    { type: "king", side: "w", state: "castled" },
    { type: "king", side: "white", state: "can-castle" },
    { type: "break", side: "black", move: "c7c5" },
    { type: "break", move: "c5" },
  ]) {
    assert.deepEqual(extractClaims(`Draft.<claims>${JSON.stringify([claim])}</claims>`), {
      body: "Draft.", claims: [],
    });
  }
});

test("drops sentences citing games missing from the pack", () => {
  const context = { xdGames: [{ id: "g1" }] };
  assert.equal(
    stripUnknownGames("Play c5. See {{game:g1}}. Strong games like {{game:x}} and {{game:<id>}} show it.", context),
    "Play c5. See {{game:g1}}.",
  );
  assert.equal(stripUnknownGames("Play c5. Games like {{game:g1}} show it.", {}), "Play c5.");
  assert.equal(stripUnknownGames("Play [[8...O-O 9.Ne5]]. Fine.", context), "Play [[8...O-O 9.Ne5]]. Fine.");
});

// Sindarov–Gukesh, move 39: the answer invented a rook on g1 and misread the files.
const endgameFen = "r2r2k1/1pp2p2/2n4B/2p4R/2P2P2/1PbN3P/8/3R2K1 w - - 0 39";
const endgame = { currentFen: endgameFen, lineFens: [], lineStartPly: 0 };

test("reads pieces on squares and file openness from the prose", () => {
  const body = [
    "O lance natural é Kh1, liberando a torre de g1 para entrar em jogo.",
    "A coluna f está meio-aberta para as brancas e as colunas g e h estão meio-abertas para as negras.",
    "O cavalo de d3 está cravado pela torre preta de d8.",
  ].join(" ");
  const audit = auditAnswer(body, [], endgame);
  assert.deepEqual(audit.falseClaims.map(({ claim }) => claim), [
    { type: "on", piece: "R", square: "g1" },
    { type: "file", file: "f", state: "half-open", for: "white" },
    { type: "file", file: "g", state: "half-open", for: "black" },
  ]);
  assert.match(audit.falseClaims[0].truth, /White king/);
  assert.equal(stripFalse(body, audit), "O cavalo de d3 está cravado pela torre preta de d8.");
});

test("skips piece mentions in sentences about a later position", () => {
  const body = "Depois de [[39.Rg5+ Kh8]], a torre em g5 controla a coluna g.";
  assert.deepEqual(proseClaims(body, endgame).filter(({ type }) => type === "on"), []);
});

test("flags lines from the current position that leave the engine lines", () => {
  const context = {
    engine: [{ san: ["Rg5+", "Kh8", "Rh5+", "Kg8"] }, { san: ["Kf1", "Bb4", "Rg5+", "Kh7"] }],
    lichess: [], xd: [],
  };
  const body = "Repita com [[39.Rg5+ Kh8 40.Rh5+]]. Para jogar, [[39.Kh1 Ne5 40.Rg5+ Ng6 41.Rxc5]] ganha o peão. Ou [[39.Kf1]].";
  const audit = auditAnswer(body, [], endgame, context);
  assert.deepEqual(audit.unverifiedLines, [{ raw: "39.Kh1 Ne5 40.Rg5+ Ng6 41.Rxc5" }]);
  assert.equal(stripFalse(body, audit), "Repita com [[39.Rg5+ Kh8 40.Rh5+]]. Ou [[39.Kf1]].");

  const deviates = "Repita com [[39.Rg5+ Kh7 40.Rh5]].";
  const partial = auditAnswer(deviates, [], endgame, context);
  assert.deepEqual(partial.unverifiedLines, [{ raw: "39.Rg5+ Kh7 40.Rh5", keep: "39.Rg5+" }]);
  assert.equal(stripFalse(deviates, partial), "Repita com [[39.Rg5+]].");
  assert.deepEqual(offEngineLines(body, endgame, {}), []);
});

const ruyFen = "1rbq1rk1/b1p2ppp/p1np1n2/Pp2p3/3PP3/1BP1BN1P/1P3PP1/RN1Q1RK1 b - - 0 12";
const ruy = { currentFen: ruyFen, lineFens: [], lineStartPly: 0 };

test("checks the attacker the prose names for a loose or attacked piece", () => {
  const wrong = "The pawn on e4 is hanging to the knight on c6, so Black must decide.";
  assert.deepEqual(proseClaims(wrong, ruy).filter(({ type }) => type === "attacks"), [{ type: "attacks", piece: "Nc6", target: "e4" }]);
  const audit = auditAnswer(wrong, [], ruy);
  assert.equal(audit.ok, false);
  assert.match(audit.falseClaims[0].truth, /Attacked squares/);
  for (const right of [
    "The pawn on e4 is hanging to the knight on f6.",
    "O peão de e4 está atacado pelo cavalo de f6.",
    "O cavalo de f6 ataca o peão de e4.",
    "The knight on f6 attacks the pawn on e4.",
  ]) assert.equal(auditAnswer(right, [], ruy).ok, true, right);
  assert.equal(auditAnswer("O cavalo de c6 ataca o peão de e4.", [], ruy).ok, false);
});
