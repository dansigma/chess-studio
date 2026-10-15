import type { PieceType, ThreatRef } from "../model";
import { formatPawns, joinList } from "./format";
import type { LocaleTable, RenderContext } from "./types";

const PIECE: Record<PieceType, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const san = (value: string, context: RenderContext): string => context.formatSan?.(value) ?? value;
const squares = (list: string[]): string => joinList(list, "and");

function threatCreated(threat: ThreatRef): string {
  switch (threat.kind) {
    case "mate-in-1":
      return "Threatens checkmate on the next move.";
    case "hanging-capture":
      return `Threatens to take the unprotected piece on ${squares(threat.targets)}.`;
    case "winning-capture":
      return `Threatens a capture that wins material on ${squares(threat.targets)}.`;
    case "fork":
      return `Sets up a fork against ${squares(threat.targets)}.`;
  }
}

function threatParried(threat: ThreatRef): string {
  switch (threat.kind) {
    case "mate-in-1":
      return "Parries the threat of checkmate.";
    case "hanging-capture":
    case "winning-capture":
      return `Removes the threat against the piece on ${squares(threat.targets)}.`;
    case "fork":
      return `Breaks up the fork aimed at ${squares(threat.targets)}.`;
  }
}

function bestThreat(threat: ThreatRef, move: string): string {
  switch (threat.kind) {
    case "mate-in-1":
      return `${move} threatens checkmate on the next move.`;
    case "hanging-capture":
      return `${move} threatens the unprotected piece on ${squares(threat.targets)}.`;
    case "winning-capture":
      return `${move} threatens a capture that wins material on ${squares(threat.targets)}.`;
    case "fork":
      return `${move} sets up a fork against ${squares(threat.targets)}.`;
  }
}

function bestParry(threat: ThreatRef, move: string): string {
  switch (threat.kind) {
    case "mate-in-1":
      return `${move} stops the threat of checkmate.`;
    case "hanging-capture":
    case "winning-capture":
      return `${move} deals with the threat against the piece on ${squares(threat.targets)}.`;
    case "fork":
      return `${move} breaks up the fork aimed at ${squares(threat.targets)}.`;
  }
}

export const EN: LocaleTable = {
  pieceName: PIECE,
  sections: {
    move: "What the move does",
    consequences: "What it allows",
    alternative: "A better option",
  },
  ui: {
    why: "Why?",
    bestLine: "Best line",
    engineOnly: "No clear reason could be proven from the position; this is the engine's view only.",
    noLine: "No engine line is available for this move.",
  },
  summary: (summary, context) => {
    const played = san(summary.playedSan, context);
    if (summary.bestSan === null) {
      return `${played} was played; the engine has no line for it.`;
    }
    const best = san(summary.bestSan, context);
    const bestEval = summary.bestPawns === null ? "" : ` (${formatPawns(summary.bestPawns)})`;
    if (summary.playedIsBest) {
      return `${played} is the engine's first choice${bestEval}.`;
    }
    const playedEval = summary.playedPawns === null ? "" : ` and leaves the evaluation at ${formatPawns(summary.playedPawns)}`;
    return `The engine prefers ${best}${bestEval}; ${played} was played${playedEval}.`;
  },
  statements: {
    captures: (p) => `The ${PIECE[p.piece]} captures the ${PIECE[p.victim]} on ${p.square}.`,
    recaptures: (p) => `The ${PIECE[p.piece]} wins the ${PIECE[p.victim]} back on ${p.square}.`,
    castles: (p) => (p.side === "k" ? "Castles kingside." : "Castles queenside."),
    promotes: (p) => `The pawn promotes to a ${PIECE[p.to]} on ${p.square}.`,
    "gives-check": (p) => `The ${PIECE[p.piece]} gives check from ${p.square}.`,
    "gives-mate": (p) => `The ${PIECE[p.piece]} delivers checkmate on ${p.square}.`,
    "attacks-loose-piece": (p) =>
      `The ${PIECE[p.piece]} now attacks the ${PIECE[p.target]} on ${p.square}, which is not adequately protected.`,
    "attacks-valuable-piece": (p) => `The ${PIECE[p.piece]} now attacks the more valuable ${PIECE[p.target]} on ${p.square}.`,
    "defends-attacked-piece": (p) => `Adds protection to the attacked ${PIECE[p.piece]} on ${p.square}.`,
    "creates-threat": (p) => threatCreated(p),
    "neutralizes-threat": (p) => threatParried(p),
    "uses-open-file": (p) =>
      p.openness === "open" ? `Puts a heavy piece on the open ${p.file}-file.` : `Puts a heavy piece on the half-open ${p.file}-file.`,
    "uses-diagonal": (p) => `Takes control of the long ${p.diagonal === "a1h8" ? "a1–h8" : "h1–a8"} diagonal.`,
    "takes-seventh-rank": (p) => `Reaches the seventh rank with a heavy piece, on ${p.square}.`,
    "attacks-pinned-piece": (p) =>
      p.pin === "absolute"
        ? `Attacks the ${PIECE[p.target]} on ${p.square}, which is pinned against its king.`
        : `Attacks the ${PIECE[p.target]} on ${p.square}, which is pinned to a more valuable piece.`,
    "breaks-pin": (p) => `Frees the pinned ${PIECE[p.piece]} on ${p.square}.`,
    "creates-xray": (p) => `Lines up an x-ray through the ${PIECE[p.through]} against the ${PIECE[p.target]} on ${p.targetSquare}.`,
    "weakens-king": (p) => `Loosens the pawn cover in front of the castled king on ${p.square}.`,
    "gives-up-material": (p) => `Offers the ${PIECE[p.piece]} on ${p.square} as a sacrifice.`,
    "sacrifice-leads-to-mate": () => "The engine line behind it ends in checkmate.",
    "sacrifice-regains-material": () => "The engine line gets the material back.",
    "allows-mate": (p) => `Allows checkmate with a move from ${p.from} to ${p.to}.`,
    "allows-capture": (p) => `Leaves the ${PIECE[p.victim]} on ${p.square} open to capture by the ${PIECE[p.attacker]}.`,
    "allows-fork": (p) => `Allows a fork: the opponent's ${PIECE[p.attacker]} can go to ${p.to}.`,
    "leaves-undefended": (p) => `Leaves the ${PIECE[p.piece]} on ${p.square} without adequate protection.`,
    "moves-into-attack": (p) => `The ${PIECE[p.piece]} lands on ${p.square}, where it is attacked without enough protection.`,
    "best-alternative": (p, c) => `Better was ${san(p.san, c)}.`,
    "best-gives-mate": (p, c) => `${san(p.san, c)} gives checkmate.`,
    "best-line-mates": (p, c) => `${san(p.san, c)} leads to a forced checkmate in the engine's line.`,
    "best-captures": (p, c) => `${san(p.san, c)} captures the ${PIECE[p.victim]} on ${p.square}.`,
    "best-gives-check": (p, c) => `${san(p.san, c)} gives check.`,
    "best-creates-threat": (p, c) => bestThreat(p, san(p.san, c)),
    "best-neutralizes-threat": (p, c) => bestParry(p, san(p.san, c)),
    "best-line-wins-material": (p, c) =>
      `The engine line after ${san(p.san, c)} nets about ${p.points} ${p.points === 1 ? "point" : "points"} of material.`,
  },
};
