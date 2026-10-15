// SIG-961: turns facts into a structured explanation. Pure and deterministic.
// Every statement below is guarded by the facts that prove it; when nothing can
// be proven the explanation is left empty and only the engine summary remains.
import type { PieceFact, PositionFacts, Threat } from "@/src/chess/facts/index";
import { PIECE_VALUE } from "@/src/chess/facts/board";
import type { ReviewLabel } from "@/src/chess/review";
import { gatherFacts, type ExplainFacts } from "./gather";
import type { Color, Explanation, Highlight, Section, Statement, StatementId, StatementParams, ThreatRef } from "./model";

export type ExplainInput = {
  fenBefore: string;
  playedUci: string;
  /** Engine's preferred line from `fenBefore`, best move first (may be empty). */
  bestPv: string[];
  label: ReviewLabel | null;
  lossCp: number;
  /** Pre-gathered facts; computed from the other fields when omitted. */
  facts?: ExplainFacts | null;
  /** The opponent's previous move, used to recognise a recapture. */
  previous?: { to: string; capture: boolean } | null;
  /** Evaluations from the mover's point of view, in pawns. */
  evals?: { bestPawns: number | null; playedPawns: number | null };
};

const NEGATIVE_LABELS: ReadonlySet<ReviewLabel> = new Set(["inaccuracy", "mistake", "miss", "blunder"]);
const MOVE_LIMIT = 4;
const CONSEQUENCE_LIMIT = 3;
const ALTERNATIVE_LIMIT = 4;
const THREATS_PER_KIND = 2;

/** Labels whose "Why?" block opens by default. */
export function isHighlightLabel(label: ReviewLabel | null): boolean {
  return label === "brilliant" || label === "miss" || label === "mistake" || label === "blunder";
}

export function isNegativeLabel(label: ReviewLabel | null): boolean {
  return label !== null && NEGATIVE_LABELS.has(label);
}

function statement<K extends StatementId>(
  id: K,
  params: StatementParams[K],
  squares: string[],
  arrows: Highlight["arrows"] = [],
): Statement {
  return { id, params, highlight: { squares: [...new Set(squares)], arrows, at: "after" } } as Statement;
}

function pieceOn(facts: PositionFacts, square: string): PieceFact | undefined {
  return facts.pieces.find((piece) => piece.square === square);
}

function threatRef(threat: Threat): ThreatRef {
  return { kind: threat.kind, targets: threat.targets };
}

function threatStatements(id: "creates-threat" | "neutralizes-threat", threats: Threat[]): Statement[] {
  return threats
    .slice(0, THREATS_PER_KIND)
    .map((threat) => statement(id, threatRef(threat), [threat.from, ...threat.targets], [{ from: threat.from, to: threat.to }]));
}

function moveSection(input: ExplainInput, facts: ExplainFacts): Statement[] {
  const { played, before, after } = facts;
  const mover = played.mover;
  const out: Statement[] = [];

  if (played.mate) {
    out.push(statement("gives-mate", { piece: played.piece, square: played.to }, [played.from, played.to]));
  } else if (played.check) {
    out.push(statement("gives-check", { piece: played.piece, square: played.to }, [played.from, played.to]));
  }
  if (played.capture) {
    const recapture = Boolean(input.previous?.capture && input.previous.to === played.to);
    out.push(
      statement(
        recapture ? "recaptures" : "captures",
        { piece: played.piece, victim: played.capture.type, square: played.capture.square },
        [played.from, played.capture.square],
      ),
    );
  }
  if (played.mate) {
    // Nothing else matters once the game is over.
    return out;
  }
  if (played.castle) {
    out.push(statement("castles", { side: played.castle }, [played.from, played.to]));
  }
  if (played.promotion) {
    out.push(statement("promotes", { to: played.promotion, square: played.to }, [played.to]));
  }
  if (played.sacrifice) {
    out.push(statement("gives-up-material", { piece: played.piece, square: played.to }, [played.to]));
    if (played.pv?.endsInMate) {
      out.push(statement("sacrifice-leads-to-mate", { piece: played.piece }, [played.to]));
    } else if (played.pv && played.pv.moves.length > 0 && played.pv.materialDelta >= 0) {
      out.push(statement("sacrifice-regains-material", { piece: played.piece }, [played.to]));
    }
  }
  out.push(...threatStatements("creates-threat", played.threats.created));
  out.push(...threatStatements("neutralizes-threat", played.threats.neutralized));

  let attackStatements = 0;
  for (const square of played.attacks) {
    const target = pieceOn(after, square);
    if (!target || target.color === mover || target.type === "k" || played.capture?.square === square || attackStatements >= 2) {
      continue;
    }
    const arrow = [{ from: played.to, to: square }];
    if (target.hanging) {
      out.push(statement("attacks-loose-piece", { piece: played.piece, target: target.type, square }, [played.to, square], arrow));
      attackStatements += 1;
    } else if (PIECE_VALUE[target.type] > PIECE_VALUE[played.piece]) {
      out.push(statement("attacks-valuable-piece", { piece: played.piece, target: target.type, square }, [played.to, square], arrow));
      attackStatements += 1;
    }
  }
  for (const square of played.defends) {
    const was = pieceOn(before, square);
    const is = pieceOn(after, square);
    if (was && is && was.attackers.length > 0 && is.attackers.length > 0 && is.defenders.includes(played.to)) {
      out.push(statement("defends-attacked-piece", { piece: is.type, square }, [played.to, square], [{ from: played.to, to: square }]));
      break;
    }
  }
  if (played.piece === "r" || played.piece === "q") {
    const file = after.files.find((entry) => entry.file === played.to[0] && entry.heavyPieces.includes(played.to));
    if (file) {
      out.push(statement("uses-open-file", { file: file.file, openness: file.openness }, [played.to]));
    }
    const seventh = after.seventhRank.find((entry) => entry.color === mover && entry.squares.includes(played.to));
    const seventhBefore = before.seventhRank.find((entry) => entry.color === mover && entry.squares.includes(played.from));
    if (seventh && !seventhBefore) {
      out.push(statement("takes-seventh-rank", { square: played.to }, [played.to]));
    }
  }
  if (played.piece === "b" || played.piece === "q") {
    const diagonal = after.diagonals.find((entry) => entry.controller === mover && entry.pieces.includes(played.to));
    if (diagonal) {
      out.push(statement("uses-diagonal", { diagonal: diagonal.diagonal }, [played.to]));
    }
  }
  for (const square of played.attacks) {
    const target = pieceOn(after, square);
    if (target && target.color !== mover && target.pinned && !target.hanging) {
      out.push(
        statement("attacks-pinned-piece", { target: target.type, square, pin: target.pinned.kind }, [played.to, square, target.pinned.by], [
          { from: played.to, to: square },
        ]),
      );
      break;
    }
  }
  for (const piece of before.pieces) {
    if (piece.color !== mover || !piece.pinned || piece.square === played.from) {
      continue;
    }
    const now = pieceOn(after, piece.square);
    if (now && now.color === mover && now.type === piece.type && !now.pinned) {
      out.push(statement("breaks-pin", { piece: piece.type, square: piece.square }, [piece.square, piece.pinned.by]));
      break;
    }
  }
  const mine = pieceOn(after, played.to);
  const xray = mine?.xrayThrough[0];
  if (mine && xray) {
    const through = pieceOn(after, xray.through);
    const target = pieceOn(after, xray.target);
    if (through && target) {
      out.push(
        statement("creates-xray", { through: through.type, target: target.type, targetSquare: xray.target }, [played.to, xray.through, xray.target], [
          { from: played.to, to: xray.target },
        ]),
      );
    }
  }
  const kingBefore = before.kings.find((king) => king.color === mover);
  const kingAfter = after.kings.find((king) => king.color === mover);
  if (kingBefore?.shieldIntact && kingBefore.castling === "castled" && kingAfter && !kingAfter.shieldIntact) {
    out.push(statement("weakens-king", { square: kingAfter.square }, [kingAfter.square, played.from]));
  }
  return out.slice(0, MOVE_LIMIT);
}

function consequenceSection(facts: ExplainFacts): Statement[] {
  const { played, before, after } = facts;
  const mover: Color = played.mover;
  const out: Statement[] = [];
  const covered = new Set<string>();

  for (const threat of played.threats.exposed) {
    const arrow = [{ from: threat.from, to: threat.to }];
    if (threat.kind === "mate-in-1") {
      out.push(statement("allows-mate", { from: threat.from, to: threat.to }, [threat.from, ...threat.targets], arrow));
      covered.add(threat.to);
    } else if (threat.kind === "fork") {
      const attacker = pieceOn(after, threat.from);
      if (attacker) {
        out.push(statement("allows-fork", { attacker: attacker.type, from: threat.from, to: threat.to }, [threat.from, threat.to, ...threat.targets], arrow));
        covered.add(threat.to);
      }
    } else {
      const victim = pieceOn(after, threat.targets[0] ?? "");
      const attacker = pieceOn(after, threat.from);
      if (victim && attacker && victim.color === mover) {
        out.push(statement("allows-capture", { victim: victim.type, square: victim.square, attacker: attacker.type }, [threat.from, victim.square], arrow));
        covered.add(victim.square);
      }
    }
  }
  const moved = pieceOn(after, played.to);
  if (moved && moved.color === mover && moved.hanging && !covered.has(moved.square) && played.piece !== "k") {
    out.push(statement("moves-into-attack", { piece: moved.type, square: moved.square }, [moved.square, ...moved.attackers]));
    covered.add(moved.square);
  }
  for (const piece of after.pieces) {
    if (piece.color !== mover || !piece.hanging || piece.type === "k" || covered.has(piece.square) || piece.square === played.to) {
      continue;
    }
    const was = pieceOn(before, piece.square);
    if (was && !was.hanging) {
      out.push(statement("leaves-undefended", { piece: piece.type, square: piece.square }, [piece.square, ...piece.attackers]));
    }
  }
  return out.slice(0, CONSEQUENCE_LIMIT);
}

function alternativeSection(facts: ExplainFacts): Statement[] {
  const { best, bestSan } = facts;
  if (!best || !bestSan) {
    return [];
  }
  const arrow = [{ from: best.from, to: best.to }];
  const out: Statement[] = [statement("best-alternative", { san: bestSan }, [best.from, best.to], arrow)];
  if (best.mate) {
    out.push(statement("best-gives-mate", { san: bestSan }, [best.from, best.to], arrow));
  } else if (best.pv?.endsInMate) {
    out.push(statement("best-line-mates", { san: bestSan }, [best.from, best.to], arrow));
  } else {
    if (best.capture) {
      out.push(
        statement("best-captures", { san: bestSan, piece: best.piece, victim: best.capture.type, square: best.capture.square }, [best.from, best.capture.square], arrow),
      );
    }
    if (best.check) {
      out.push(statement("best-gives-check", { san: bestSan, piece: best.piece }, [best.from, best.to], arrow));
    }
    const created = best.threats.created[0];
    if (created) {
      out.push(statement("best-creates-threat", { ...threatRef(created), san: bestSan }, [best.to, ...created.targets], arrow));
    }
    const neutralized = best.threats.neutralized[0];
    if (neutralized) {
      out.push(statement("best-neutralizes-threat", { ...threatRef(neutralized), san: bestSan }, [best.to, ...neutralized.targets], arrow));
    }
    if (best.pv && best.pv.materialDelta >= 1) {
      out.push(statement("best-line-wins-material", { san: bestSan, points: Math.round(best.pv.materialDelta) }, [best.from, best.to], arrow));
    }
  }
  return out.slice(0, ALTERNATIVE_LIMIT);
}

/** Statements about things that stand in the position before the move (a captured piece, a parried threat). */
const BEFORE_IDS: ReadonlySet<StatementId> = new Set(["captures", "recaptures", "neutralizes-threat"]);

function placed(item: Statement, force: boolean): Statement {
  return force || BEFORE_IDS.has(item.id) ? { ...item, highlight: { ...item.highlight, at: "before" } } : item;
}

export function explainMove(input: ExplainInput): Explanation | null {
  const facts = input.facts ?? gatherFacts(input.fenBefore, input.playedUci, input.bestPv);
  if (!facts || !facts.before.valid || !facts.after.valid) {
    return null;
  }
  const sections: Section[] = [];
  const move = moveSection(input, facts);
  if (move.length > 0) {
    sections.push({ id: "move", statements: move.map((item) => placed(item, false)) });
  }
  if (isNegativeLabel(input.label)) {
    const consequences = consequenceSection(facts);
    if (consequences.length > 0) {
      sections.push({ id: "consequences", statements: consequences.map((item) => placed(item, false)) });
    }
    const alternative = alternativeSection(facts);
    if (alternative.length > 0) {
      sections.push({ id: "alternative", statements: alternative.map((item) => placed(item, true)) });
    }
  }
  // The bare "best alternative" line is engine output, not a fact-backed reason.
  const evidence = sections.some((section) => section.statements.some((item) => item.id !== "best-alternative"));
  return {
    sections: evidence ? sections : [],
    summary: {
      playedSan: facts.played.san,
      bestSan: facts.bestSan,
      playedIsBest: input.bestPv[0] === input.playedUci,
      bestPawns: input.evals?.bestPawns ?? null,
      playedPawns: input.evals?.playedPawns ?? null,
    },
    confident: evidence,
  };
}
