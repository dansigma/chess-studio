import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { EXPLAIN_LOCALES, explainLocaleFromLanguage, isExplainLocale } from "./locale.ts";
import { PT_BR } from "./locales/pt-br.ts";
import { SCENARIOS, explain } from "./fixtures.ts";
import type { Highlight, Statement, StatementId, StatementParams } from "./model.ts";
import { renderExplanation, renderStatement, renderSummary, sectionTitle, uiText } from "./render.ts";

const NO_HIGHLIGHT: Highlight = { squares: [], arrows: [], at: "after" };

// One sample per statement id. Typed as a full record so a new id cannot ship
// without a sample (and therefore without a rendered test in both locales).
const SAMPLES: { [K in StatementId]: StatementParams[K] } = {
  captures: { piece: "r", victim: "n", square: "f6" },
  recaptures: { piece: "q", victim: "b", square: "d5" },
  castles: { side: "q" },
  promotes: { to: "q", square: "e8" },
  "gives-check": { piece: "r", square: "e1" },
  "gives-mate": { piece: "q", square: "h4" },
  "attacks-loose-piece": { piece: "n", target: "q", square: "d8" },
  "attacks-valuable-piece": { piece: "b", target: "r", square: "a8" },
  "defends-attacked-piece": { piece: "r", square: "e4" },
  "creates-threat": { kind: "fork", targets: ["c8", "e8"] },
  "neutralizes-threat": { kind: "mate-in-1", targets: ["g1"] },
  "uses-open-file": { file: "d", openness: "open" },
  "uses-diagonal": { diagonal: "a1h8" },
  "takes-seventh-rank": { square: "d7" },
  "attacks-pinned-piece": { target: "n", square: "c3", pin: "absolute" },
  "breaks-pin": { piece: "q", square: "d2" },
  "creates-xray": { through: "n", target: "r", targetSquare: "e8" },
  "weakens-king": { square: "g1" },
  "gives-up-material": { piece: "r", square: "h7" },
  "sacrifice-leads-to-mate": { piece: "q" },
  "sacrifice-regains-material": { piece: "n" },
  "allows-mate": { from: "d8", to: "h4" },
  "allows-capture": { victim: "r", square: "a1", attacker: "b" },
  "allows-fork": { attacker: "n", from: "b5", to: "c7" },
  "leaves-undefended": { piece: "q", square: "d1" },
  "moves-into-attack": { piece: "b", square: "g5" },
  "best-alternative": { san: "Nf3" },
  "best-gives-mate": { san: "Qh7#" },
  "best-line-mates": { san: "Rxe6" },
  "best-captures": { san: "Bxf7+", piece: "b", victim: "p", square: "f7" },
  "best-gives-check": { san: "Re8+", piece: "r" },
  "best-creates-threat": { kind: "winning-capture", targets: ["d5"], san: "Bb5" },
  "best-neutralizes-threat": { kind: "hanging-capture", targets: ["e4"], san: "Nd2" },
  "best-line-wins-material": { san: "Qxd5", points: 3 },
};

function sample(id: StatementId): Statement {
  return { id, params: SAMPLES[id], highlight: NO_HIGHLIGHT } as Statement;
}

const ALL_IDS = Object.keys(SAMPLES) as StatementId[];

test("every statement id renders in both locales without leftovers", () => {
  for (const locale of EXPLAIN_LOCALES) {
    for (const id of ALL_IDS) {
      const text = renderStatement(locale, sample(id));
      assert.ok(text.length > 8, `${locale}:${id} is empty`);
      assert.doesNotMatch(text, /undefined|NaN|\[object|\{|\}|null/, `${locale}:${id} leaks: ${text}`);
      assert.match(text, /[.!]$/, `${locale}:${id} should be a whole sentence: ${text}`);
    }
  }
});

test("the Portuguese table covers every statement id, section, ui text and summary", () => {
  for (const id of ALL_IDS) {
    assert.equal(typeof PT_BR.statements[id], "function", `pt-br is missing ${id}`);
  }
  for (const id of ["move", "consequences", "alternative"] as const) {
    assert.ok(PT_BR.sections[id]);
  }
  for (const key of ["why", "bestLine", "engineOnly", "noLine"] as const) {
    assert.ok(PT_BR.ui[key]);
  }
});

test("English sentences (snapshot)", () => {
  const en = (id: StatementId) => renderStatement("en", sample(id));
  assert.equal(en("captures"), "The rook captures the knight on f6.");
  assert.equal(en("recaptures"), "The queen wins the bishop back on d5.");
  assert.equal(en("castles"), "Castles queenside.");
  assert.equal(en("promotes"), "The pawn promotes to a queen on e8.");
  assert.equal(en("attacks-loose-piece"), "The knight now attacks the queen on d8, which is not adequately protected.");
  assert.equal(en("creates-threat"), "Sets up a fork against c8 and e8.");
  assert.equal(en("neutralizes-threat"), "Parries the threat of checkmate.");
  assert.equal(en("attacks-pinned-piece"), "Attacks the knight on c3, which is pinned against its king.");
  assert.equal(en("allows-capture"), "Leaves the rook on a1 open to capture by the bishop.");
  assert.equal(en("allows-fork"), "Allows a fork: the opponent's knight can go to c7.");
  assert.equal(en("best-alternative"), "Better was Nf3.");
  assert.equal(en("best-line-wins-material"), "The engine line after Qxd5 nets about 3 points of material.");
});

test("Portuguese sentences (snapshot)", () => {
  const pt = (id: StatementId) => renderStatement("pt-br", sample(id));
  assert.equal(pt("captures"), "A torre captura o cavalo em f6.");
  assert.equal(pt("recaptures"), "A dama recaptura o bispo em d5.");
  assert.equal(pt("castles"), "Roque grande.");
  assert.equal(pt("promotes"), "O peão é promovido a dama em e8.");
  assert.equal(pt("attacks-loose-piece"), "O cavalo agora ataca a dama em d8, que não está bem protegida.");
  assert.equal(pt("creates-threat"), "Prepara um garfo contra c8 e e8.");
  assert.equal(pt("attacks-pinned-piece"), "Ataca o cavalo em c3, cravado contra o rei.");
  assert.equal(pt("allows-capture"), "Deixa a torre em a1 sujeita à captura pelo bispo.");
  assert.equal(pt("allows-fork"), "Permite um garfo: o cavalo do adversário pode ir para c7.");
  assert.equal(pt("defends-attacked-piece"), "Reforça a proteção da torre atacada em e4.");
  assert.equal(pt("best-alternative"), "Melhor era Nf3.");
  assert.equal(pt("best-line-wins-material"), "A linha do motor depois de Qxd5 rende cerca de 3 pontos de material.");
});

test("Portuguese agrees in gender and number with the piece", () => {
  const withPiece = (id: "captures" | "moves-into-attack", piece: "n" | "r" | "q" | "p") =>
    renderStatement("pt-br", { id, params: id === "captures" ? { piece, victim: "p", square: "e5" } : { piece, square: "e5" }, highlight: NO_HIGHLIGHT } as Statement);
  assert.equal(withPiece("moves-into-attack", "n"), "O cavalo vai para e5, onde é atacado sem proteção suficiente.");
  assert.equal(withPiece("moves-into-attack", "r"), "A torre vai para e5, onde é atacada sem proteção suficiente.");
  assert.equal(withPiece("moves-into-attack", "q"), "A dama vai para e5, onde é atacada sem proteção suficiente.");
  assert.equal(withPiece("captures", "p"), "O peão captura o peão em e5.");
  const one = renderStatement("pt-br", sample("best-line-wins-material"));
  const single = renderStatement("pt-br", { id: "best-line-wins-material", params: { san: "Qxd5", points: 1 }, highlight: NO_HIGHLIGHT });
  assert.match(one, /3 pontos/);
  assert.match(single, /1 ponto de/);
});

test("the notation setting formats SAN inside sentences", () => {
  const formatSan = (san: string) => san.replace("N", "♘");
  assert.equal(renderStatement("en", sample("best-alternative"), { formatSan }), "Better was ♘f3.");
  assert.equal(renderStatement("pt-br", sample("best-alternative"), { formatSan }), "Melhor era ♘f3.");
});

test("engine summaries read naturally in both locales", () => {
  const base = { playedSan: "Kxd1", bestSan: "Nd5#", playedIsBest: false, bestPawns: 12.5, playedPawns: -0.4 };
  assert.equal(renderSummary("en", base), "The engine prefers Nd5# (+12.5); Kxd1 was played and leaves the evaluation at -0.4.");
  assert.equal(renderSummary("pt-br", base), "O motor prefere Nd5# (+12,5); foi jogado Kxd1 e a avaliação fica em -0,4.");
  assert.equal(renderSummary("en", { ...base, playedIsBest: true, playedSan: "Nd5#" }), "Nd5# is the engine's first choice (+12.5).");
  assert.equal(renderSummary("pt-br", { ...base, bestSan: null }), "Kxd1 foi jogado; o motor não tem uma linha para ele.");
  assert.equal(renderSummary("en", { ...base, bestPawns: null, playedPawns: null }), "The engine prefers Nd5#; Kxd1 was played.");
});

test("a missing translation falls back to English and logs outside production", () => {
  const warn = mock.method(console, "warn", () => undefined);
  const original = PT_BR.statements.castles;
  try {
    delete (PT_BR.statements as Partial<typeof PT_BR.statements>).castles;
    assert.equal(renderStatement("pt-br", sample("castles")), "Castles queenside.");
    assert.equal(warn.mock.callCount(), 1);
    assert.match(String(warn.mock.calls[0].arguments[0]), /missing pt-br text for "castles"/);
  } finally {
    PT_BR.statements.castles = original;
    warn.mock.restore();
  }
});

test("section titles and ui texts exist in both locales", () => {
  assert.equal(sectionTitle("en", "alternative"), "A better option");
  assert.equal(sectionTitle("pt-br", "alternative"), "Uma opção melhor");
  assert.equal(uiText("en", "why"), "Why?");
  assert.equal(uiText("pt-br", "why"), "Por quê?");
});

test("fixture explanations render in both locales (snapshot of the missed mate)", () => {
  const explanation = explain(SCENARIOS.legalMissedMate);
  const en = renderExplanation("en", explanation);
  assert.deepEqual(
    en.sections.map((section) => [section.title, section.items.map((item) => item.text)]),
    [
      ["What the move does", ["The king captures the bishop on d1.", "Removes the threat against the piece on c2."]],
      ["A better option", ["Better was Nd5#.", "Nd5# gives checkmate."]],
    ],
  );
  const pt = renderExplanation("pt-br", explanation);
  assert.deepEqual(
    pt.sections.map((section) => [section.title, section.items.map((item) => item.text)]),
    [
      ["O que o lance faz", ["O rei captura o bispo em d1.", "Elimina a ameaça contra a peça em c2."]],
      ["Uma opção melhor", ["Melhor era Nd5#.", "Nd5# dá xeque-mate."]],
    ],
  );
});

test("locale helpers", () => {
  assert.equal(isExplainLocale("pt-br"), true);
  assert.equal(isExplainLocale("pt"), false);
  assert.equal(isExplainLocale(undefined), false);
  assert.equal(explainLocaleFromLanguage("pt-BR"), "pt-br");
  assert.equal(explainLocaleFromLanguage("pt"), "pt-br");
  assert.equal(explainLocaleFromLanguage("en-US"), "en");
  assert.equal(explainLocaleFromLanguage(undefined), "en");
});
