// SIG-1221: score the fact extractor and the template explainer on a set of items.
//
// Measures (no LLM involved):
//  - extractor recall: the author (or a hand label) names a theme, do our facts contain it?
//  - unlabelled detections: our predicate fires where the author named nothing. This is a
//    precision PROXY, not an error count: authors do not mention everything on the board.
//  - hard checks: `mustMention` (facts must contain the theme) and `mustNotClaim` (facts
//    must not report it); these are hand-verified, so a failure is a real extractor error.
//  - explainer contradictions: statements from explainMove that disagree with the engine
//    ground truth or the author's verdict (rules R1-R6 below).
import { Chess } from "chess.js";
import { computeMoveFacts } from "../../src/chess/facts/index.ts";
import { gatherFacts } from "../../src/chess/explain/gather.ts";
import { explainMove } from "../../src/chess/explain/explain-move.ts";
import { gradeMove } from "../../src/chess/review.ts";
import { GOOD_MOVE_NAGS, PHASES } from "./schema.mjs";
import { THEMES, isMappedTheme, mappingTable, squaresInText, themeById } from "./themes.mjs";
import { scoreToCp } from "./uci.mjs";

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Contradiction rules, documented for the report and the README. */
export const RULES = [
  {
    id: "R1",
    name: "best-line-wins-material vs replayed engine line",
    text: "`best-line-wins-material` claims the engine's best line nets N pawns of material. The line is replayed independently with chess.js; the claim is a contradiction when the replayed gain is more than one pawn below N.",
  },
  {
    id: "R2",
    name: "mate claims vs engine score",
    text: "`best-gives-mate` / `best-line-mates` need the engine's score before the move to be a forced mate for the mover; `sacrifice-leads-to-mate` needs the score after the played move to be a forced mate for the mover.",
  },
  {
    id: "R3",
    name: "allows-mate vs engine score",
    text: "`allows-mate` says the opponent can mate next move; the engine score after the played move must be a forced mate against the mover.",
  },
  {
    id: "R4",
    name: "neutralizes-threat vs engine reply",
    text: "`neutralizes-threat` says an opponent threat is parried. It is a contradiction when the engine's best reply to the played move captures a piece the threat was aimed at (or, for a mate threat, delivers checkmate).",
  },
  {
    id: "R5",
    name: "sacrifice-regains-material vs engine loss",
    text: "`sacrifice-regains-material` says the sacrifice pays off; it is a contradiction when the engine says the played move gives up 300 cp or more against the best move.",
  },
  {
    id: "R6",
    name: "criticism of an author-praised move",
    text: "Any statement of the `consequences` section (allows-*, moves-into-attack, leaves-undefended) is a flaw claim about the played move; it is a contradiction with the author when the author marked that move ! or !!. When the item is also flagged `authorDisagrees`, it is an engine-vs-author conflict rather than an extractor error.",
  },
];

const MATE_SIDE = (score) => (score && "mate" in score ? score.mate : null);

function materialDeltaAlong(fen, ucis, mover) {
  const board = new Chess(fen);
  const balance = () => {
    let total = 0;
    for (const row of board.board()) {
      for (const piece of row) {
        if (piece) total += piece.color === mover ? PIECE_VALUE[piece.type] : -PIECE_VALUE[piece.type];
      }
    }
    return total;
  };
  const start = balance();
  for (const uci of ucis) {
    try {
      board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
  }
  return balance() - start;
}

function whitePawns(score, mover) {
  if (!score) return 0;
  const cp = Math.max(-1000, Math.min(1000, scoreToCp(score)));
  return (mover === "w" ? cp : -cp) / 100;
}

/** Run the template explainer on an item with its engine ground truth. */
function explainItem(item, facts) {
  const engine = item.engine ?? null;
  const bestPv = engine?.lines[0]?.pv ?? [];
  let label = null;
  let lossCp = 0;
  let evals;
  if (engine?.evalBefore && (engine.playedLineScore ?? engine.evalAfter?.score)) {
    const mover = facts.played.mover;
    const playedScore = engine.playedLineScore ?? engine.evalAfter.score;
    const graded = gradeMove({
      side: mover,
      playedUci: item.playedMove.uci,
      before: {
        whitePawns: whitePawns(engine.evalBefore, mover),
        bestUci: bestPv[0] ?? null,
        secondWhitePawns: engine.lines[1] ? whitePawns(engine.lines[1].score, mover) : null,
      },
      afterWhitePawns: whitePawns(playedScore, mover),
      sacrifice: facts.played.sacrifice,
    });
    label = graded.label;
    lossCp = graded.lossCp;
    evals = { bestPawns: scoreToCp(engine.evalBefore) / 100, playedPawns: scoreToCp(playedScore) / 100 };
  }
  return explainMove({ fenBefore: item.fen, playedUci: item.playedMove.uci, bestPv, label, lossCp, facts, evals });
}

/** Apply rules R1-R6 to one explanation. */
export function checkExplanation(item, explanation, facts) {
  const found = [];
  if (!explanation) return found;
  const engine = item.engine ?? null;
  const mover = facts.played.mover;
  const add = (rule, statement, detail) => found.push({ rule, itemId: item.id, statement: statement.id, detail });
  const beforeMate = MATE_SIDE(engine?.evalBefore);
  const afterMate = MATE_SIDE(engine?.evalAfter?.score);
  for (const section of explanation.sections) {
    for (const statement of section.statements) {
      const id = statement.id;
      if (id === "best-line-wins-material" && engine) {
        const gain = materialDeltaAlong(item.fen, engine.lines[0]?.pv ?? [], mover);
        if (gain < statement.params.points - 1) {
          add("R1", statement, `claims +${statement.params.points}, replayed engine line gains ${gain}`);
        }
      }
      if ((id === "best-gives-mate" || id === "best-line-mates") && engine && !(beforeMate !== null && beforeMate > 0)) {
        add("R2", statement, `engine score before the move is ${JSON.stringify(engine.evalBefore)}, not a mate for the mover`);
      }
      if (id === "sacrifice-leads-to-mate" && engine && !(afterMate !== null && afterMate > 0)) {
        add("R2", statement, `engine score after the move is ${JSON.stringify(engine.evalAfter?.score ?? null)}, not a mate for the mover`);
      }
      if (id === "allows-mate" && engine && !(afterMate !== null && afterMate < 0)) {
        add("R3", statement, `engine score after the move is ${JSON.stringify(engine.evalAfter?.score ?? null)}, not a mate against the mover`);
      }
      if (id === "neutralizes-threat" && engine?.evalAfter?.pv[0]) {
        const reply = engine.evalAfter.pv[0];
        const after = new Chess(facts.after.fen);
        const target = after.get(reply.slice(2, 4));
        const threat = statement.params;
        if (threat.kind === "mate-in-1") {
          const probe = new Chess(facts.after.fen);
          try {
            const san = probe.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] }).san;
            if (san.endsWith("#")) add("R4", statement, `parried mate threat, but the engine reply ${san} mates`);
          } catch {
            // reply not playable from here: nothing to compare
          }
        } else if (target && target.color === mover && threat.targets.includes(reply.slice(2, 4))) {
          add("R4", statement, `says the threat on ${reply.slice(2, 4)} is parried, but the engine reply ${reply} takes it`);
        }
      }
      if (id === "sacrifice-regains-material" && engine && (engine.lossCp ?? 0) >= 300) {
        add("R5", statement, `engine says the move loses ${engine.lossCp} cp against the best move`);
      }
      if (section.id === "consequences" && item.nags.some((nag) => GOOD_MOVE_NAGS.includes(nag))) {
        add("R6", statement, `criticises a move the author marked as good (${item.authorDisagrees?.flag ? "item is flagged authorDisagrees" : "engine agrees with the author"})`);
      }
    }
  }
  return found;
}

export function evaluateItem(item) {
  const bestPv = item.engine?.lines[0]?.pv ?? [];
  const facts = gatherFacts(item.fen, item.playedMove.uci, bestPv);
  if (!facts || !facts.before.valid || !facts.after.valid) {
    return { id: item.id, error: "facts could not be computed for this position and move" };
  }
  const authorBestUci = item.authorBestMove?.uci ?? null;
  const bestFacts = authorBestUci ? computeMoveFacts(item.fen, authorBestUci) : null;
  const afterScore = item.engine?.evalAfter?.score ?? null;
  const ctx = {
    fen: item.fen,
    playedUci: item.playedMove.uci,
    authorBestUci,
    facts,
    bestFacts,
    engine: item.engine ? { evalAfterMate: MATE_SIDE(afterScore) } : null,
  };
  const detections = {};
  for (const theme of THEMES) {
    if (theme.predicate) detections[theme.id] = theme.predicate(ctx);
  }
  const explanation = explainItem(item, facts);
  const statements = explanation ? explanation.sections.flatMap((section) => section.statements.map((s) => s.id)) : [];
  return {
    id: item.id,
    detections,
    statements,
    confident: explanation?.confident ?? false,
    contradictions: checkExplanation(item, explanation, facts),
  };
}

const ratio = (hit, total) => (total === 0 ? null : hit / total);
export const pct = (value) => (value === null ? "n/a" : `${(value * 100).toFixed(0)}%`);
const snippet = (text) => (text.length > 110 ? `${text.slice(0, 107)}...` : text);

/** Aggregate per-item evaluations into the report data. */
export function buildReport(items, options = {}) {
  const evaluated = items.map((item) => ({ item, result: evaluateItem(item) }));
  const errors = evaluated.filter(({ result }) => result.error).map(({ result }) => ({ id: result.id, error: result.error }));
  const ok = evaluated.filter(({ result }) => !result.error);

  const emptyStats = () => ({ labelled: 0, hit: 0, unlabelledDetections: 0, unlabelledPossible: 0, squareChecked: 0, squareAgree: 0, misses: [] });
  const perTheme = Object.fromEntries(THEMES.filter((t) => t.predicate).map((t) => [t.id, emptyStats()]));
  const perPhase = Object.fromEntries(PHASES.map((phase) => [phase, { items: 0, ...emptyStats(), themes: Object.fromEntries(Object.keys(perTheme).map((id) => [id, emptyStats()])) }]));
  const hard = { mustMention: { total: 0, hit: 0, failures: [] }, mustNotClaim: { total: 0, violations: [] } };
  const unmapped = {};
  const unknownTags = {};
  const contradictions = [];
  let withStatements = 0;
  let confident = 0;
  let statementsTotal = 0;
  let disagreeing = [];

  for (const { item, result } of ok) {
    perPhase[item.phase].items += 1;
    const named = squaresInText(item.authorText);
    for (const theme of Object.keys(perTheme)) {
      const detection = result.detections[theme];
      const labelled = item.themes.includes(theme);
      for (const bucket of [perTheme[theme], perPhase[item.phase], perPhase[item.phase].themes[theme]]) {
        if (labelled) {
          bucket.labelled += 1;
          if (detection.hit) {
            bucket.hit += 1;
            if (named.length > 0) {
              bucket.squareChecked += 1;
              if (detection.squares.some((square) => named.includes(square))) bucket.squareAgree += 1;
            }
          } else if (bucket === perTheme[theme]) {
            bucket.misses.push({ id: item.id, phase: item.phase, text: snippet(item.authorText), note: "no matching fact" });
          }
        } else {
          bucket.unlabelledPossible += 1;
          if (detection.hit) bucket.unlabelledDetections += 1;
        }
      }
    }
    for (const theme of item.mustMention) {
      if (!isMappedTheme(theme)) continue;
      hard.mustMention.total += 1;
      if (result.detections[theme].hit) hard.mustMention.hit += 1;
      else hard.mustMention.failures.push({ id: item.id, theme });
    }
    for (const theme of item.mustNotClaim) {
      if (!isMappedTheme(theme)) continue;
      hard.mustNotClaim.total += 1;
      if (result.detections[theme].hit) hard.mustNotClaim.violations.push({ id: item.id, theme, evidence: result.detections[theme].note });
    }
    for (const theme of item.unmappedThemes) unmapped[theme] = (unmapped[theme] ?? 0) + 1;
    for (const tag of item.unknownTags) unknownTags[tag] = (unknownTags[tag] ?? 0) + 1;
    statementsTotal += result.statements.length;
    if (result.statements.length > 0) withStatements += 1;
    if (result.confident) confident += 1;
    contradictions.push(...result.contradictions);
    if (item.authorDisagrees?.flag) disagreeing.push({ id: item.id, reasons: item.authorDisagrees.reasons });
  }

  const sumBuckets = (buckets) =>
    buckets.reduce(
      (acc, b) => ({ labelled: acc.labelled + b.labelled, hit: acc.hit + b.hit, unlabelledDetections: acc.unlabelledDetections + b.unlabelledDetections }),
      { labelled: 0, hit: 0, unlabelledDetections: 0 },
    );
  const overall = sumBuckets(Object.values(perTheme));
  const withEngine = ok.filter(({ item }) => item.engine).length;
  const byRule = Object.fromEntries(RULES.map((rule) => [rule.id, contradictions.filter((c) => c.rule === rule.id).length]));

  const report = {
    split: options.split ?? "all",
    items: items.length,
    evaluated: ok.length,
    errors,
    withEngineTruth: withEngine,
    overall: { ...overall, recall: ratio(overall.hit, overall.labelled), agreement: overall.labelled === 0 ? null : ratio(overall.hit, overall.hit + overall.unlabelledDetections) },
    perTheme: Object.fromEntries(
      Object.entries(perTheme).map(([id, s]) => [id, { ...s, group: themeById(id).group, recall: ratio(s.hit, s.labelled), agreement: s.labelled === 0 ? null : ratio(s.hit, s.hit + s.unlabelledDetections) }]),
    ),
    perPhase: Object.fromEntries(
      Object.entries(perPhase).map(([phase, s]) => {
        const sums = sumBuckets(Object.values(s.themes));
        return [
          phase,
          {
            items: s.items,
            ...sums,
            recall: ratio(sums.hit, sums.labelled),
            agreement: sums.labelled === 0 ? null : ratio(sums.hit, sums.hit + sums.unlabelledDetections),
            themes: Object.fromEntries(Object.entries(s.themes).filter(([, t]) => t.labelled > 0 || t.unlabelledDetections > 0).map(([id, t]) => [id, { labelled: t.labelled, hit: t.hit, recall: ratio(t.hit, t.labelled), unlabelledDetections: t.unlabelledDetections }])),
          },
        ];
      }),
    ),
    hardChecks: hard,
    unmappedThemes: unmapped,
    unknownTags,
    explainer: {
      itemsChecked: ok.length,
      withEngineTruth: withEngine,
      itemsWithStatements: withStatements,
      confident,
      statements: statementsTotal,
      contradictions,
      byRule,
      itemsWithContradiction: new Set(contradictions.map((c) => c.itemId)).size,
    },
    authorDisagrees: disagreeing,
    mapping: mappingTable(),
  };
  return report;
}

export function renderMarkdown(report) {
  const out = [];
  const row = (...cells) => `| ${cells.join(" | ")} |`;
  out.push(`# Valset report (split: ${report.split})`, "");
  out.push(`- Items: ${report.items} (${report.evaluated} evaluated, ${report.withEngineTruth} with engine ground truth, ${report.errors.length} errors)`);
  out.push(`- Extractor recall on author-named themes: **${pct(report.overall.recall)}** (${report.overall.hit}/${report.overall.labelled})`);
  out.push(`- Unlabelled detections (precision proxy, not errors): ${report.overall.unlabelledDetections}; agreement ${pct(report.overall.agreement)}`);
  out.push(`- Template explainer: ${report.explainer.statements} statements on ${report.explainer.itemsWithStatements} items; **${report.explainer.contradictions.length} contradiction(s)** on ${report.explainer.itemsWithContradiction} item(s)`);
  out.push(`- Author vs engine disagreements flagged: ${report.authorDisagrees.length}`, "");

  out.push("## Per theme", "", row("theme", "group", "labelled", "hit", "recall", "unlabelled detections", "agreement", "square-agree"), row("---", "---", "---:", "---:", "---:", "---:", "---:", "---:"));
  for (const [id, s] of Object.entries(report.perTheme)) {
    if (s.labelled === 0 && s.unlabelledDetections === 0) continue;
    out.push(row(id, s.group, s.labelled, s.hit, pct(s.recall), s.unlabelledDetections, pct(s.agreement), s.squareChecked ? `${s.squareAgree}/${s.squareChecked}` : "-"));
  }
  out.push("", "`recall` = author named the theme and a fact matches. `agreement` = hits / (hits + unlabelled detections): a precision proxy, because an author does not name everything on the board. `square-agree` = hits whose fact squares overlap the squares the author named.", "");

  out.push("## Per phase", "", row("phase", "items", "labelled", "hit", "recall", "unlabelled detections", "agreement"), row("---", "---:", "---:", "---:", "---:", "---:", "---:"));
  for (const [phase, s] of Object.entries(report.perPhase)) {
    out.push(row(phase, s.items, s.labelled, s.hit, pct(s.recall), s.unlabelledDetections, pct(s.agreement)));
  }
  out.push("", "### Recall by theme and phase", "", row("theme", ...PHASES), row("---", ...PHASES.map(() => "---:")));
  for (const id of Object.keys(report.perTheme)) {
    const cells = PHASES.map((phase) => {
      const t = report.perPhase[phase].themes[id];
      return t && t.labelled > 0 ? `${pct(t.recall)} (${t.hit}/${t.labelled})` : "-";
    });
    if (cells.some((cell) => cell !== "-")) out.push(row(id, ...cells));
  }

  out.push("", "## Misses (author named it, no fact matches)", "");
  const misses = Object.entries(report.perTheme).flatMap(([theme, s]) => s.misses.map((m) => ({ theme, ...m })));
  if (misses.length === 0) out.push("None.");
  for (const miss of misses) out.push(`- \`${miss.id}\` [${miss.theme}, ${miss.phase}]: ${miss.text}`);

  out.push("", "## Hand-verified checks", "");
  const { mustMention, mustNotClaim } = report.hardChecks;
  out.push(`- mustMention: ${mustMention.hit}/${mustMention.total} present${mustMention.failures.map((f) => `\n  - FAIL \`${f.id}\`: ${f.theme}`).join("")}`);
  out.push(`- mustNotClaim: ${mustNotClaim.violations.length} violation(s) of ${mustNotClaim.total}${mustNotClaim.violations.map((v) => `\n  - FAIL \`${v.id}\`: ${v.theme} (${v.evidence})`).join("")}`);

  out.push("", "## Unmapped themes and unknown tags", "");
  const unmapped = Object.entries(report.unmappedThemes);
  out.push(unmapped.length ? `Themes the author used that have no fact kind yet (reported, never dropped): ${unmapped.map(([k, v]) => `${k} x${v}`).join(", ")}.` : "No unmapped themes in use.");
  const unknown = Object.entries(report.unknownTags);
  out.push(unknown.length ? `Unknown theme words in hand-label tags: ${unknown.map(([k, v]) => `${k} x${v}`).join(", ")}. Add them to scripts/valset/themes.mjs or fix the tag.` : "No unknown theme tags.");

  out.push("", "## Template explainer contradictions", "", `Items with statements: ${report.explainer.itemsWithStatements}/${report.explainer.itemsChecked}; confident: ${report.explainer.confident}.`, "");
  out.push(row("rule", "contradictions", "check"), row("---", "---:", "---"));
  for (const rule of RULES) out.push(row(rule.id, report.explainer.byRule[rule.id], rule.name));
  out.push("");
  if (report.explainer.contradictions.length === 0) out.push("No contradictions found.");
  for (const c of report.explainer.contradictions) out.push(`- ${c.rule} \`${c.itemId}\` \`${c.statement}\`: ${c.detail}`);

  out.push("", "## Author vs engine", "");
  if (report.authorDisagrees.length === 0) out.push("No disagreements flagged.");
  for (const d of report.authorDisagrees) out.push(`- \`${d.id}\`: ${d.reasons.join(", ")}`);

  out.push("", "## Theme to fact mapping", "", row("theme", "group", "fact kind", "gap"), row("---", "---", "---", "---"));
  for (const m of report.mapping) out.push(row(m.id, m.group, m.factKind ?? "(unmapped)", m.gap ?? ""));
  out.push("");
  return out.join("\n");
}
