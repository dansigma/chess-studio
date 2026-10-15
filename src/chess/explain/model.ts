// SIG-961: the explanation model. Plain data only — statement ids with typed
// params and the board squares they talk about. Not one sentence lives here;
// all wording goes through the locale tables (see render.ts).
import type { Color, PieceType, ThreatKind } from "@/src/chess/facts/index";

export type { Color, PieceType, ThreatKind };

export type SectionId = "move" | "consequences" | "alternative";

/** A threat, reduced to what a sentence needs. */
export type ThreatRef = {
  kind: ThreatKind;
  /** Squares of the pieces under threat (the king for a mate). */
  targets: string[];
};

export type StatementParams = {
  // What the move does
  captures: { piece: PieceType; victim: PieceType; square: string };
  recaptures: { piece: PieceType; victim: PieceType; square: string };
  castles: { side: "k" | "q" };
  promotes: { to: PieceType; square: string };
  "gives-check": { piece: PieceType; square: string };
  "gives-mate": { piece: PieceType; square: string };
  "attacks-loose-piece": { piece: PieceType; target: PieceType; square: string };
  "attacks-valuable-piece": { piece: PieceType; target: PieceType; square: string };
  "defends-attacked-piece": { piece: PieceType; square: string };
  "creates-threat": ThreatRef;
  "neutralizes-threat": ThreatRef;
  "uses-open-file": { file: string; openness: "open" | "half-open" };
  "uses-diagonal": { diagonal: "a1h8" | "h1a8" };
  "takes-seventh-rank": { square: string };
  "attacks-pinned-piece": { target: PieceType; square: string; pin: "absolute" | "relative" };
  "breaks-pin": { piece: PieceType; square: string };
  "creates-xray": { through: PieceType; target: PieceType; targetSquare: string };
  "weakens-king": { square: string };
  "gives-up-material": { piece: PieceType; square: string };
  "sacrifice-leads-to-mate": { piece: PieceType };
  "sacrifice-regains-material": { piece: PieceType };
  // What it allows / leaves behind
  "allows-mate": { from: string; to: string };
  "allows-capture": { victim: PieceType; square: string; attacker: PieceType };
  "allows-fork": { attacker: PieceType; from: string; to: string };
  "leaves-undefended": { piece: PieceType; square: string };
  "moves-into-attack": { piece: PieceType; square: string };
  // The better alternative
  "best-alternative": { san: string };
  "best-gives-mate": { san: string };
  "best-line-mates": { san: string };
  "best-captures": { san: string; piece: PieceType; victim: PieceType; square: string };
  "best-gives-check": { san: string; piece: PieceType };
  "best-creates-threat": ThreatRef & { san: string };
  "best-neutralizes-threat": ThreatRef & { san: string };
  "best-line-wins-material": { san: string; points: number };
};

export type StatementId = keyof StatementParams;

export type Arrow = { from: string; to: string };

/**
 * Board squares / arrows a statement refers to; the UI turns them into transient hover marks.
 * `at` says which position they belong to: the one before the played move or the one after it.
 */
export type Highlight = { squares: string[]; arrows: Arrow[]; at: "before" | "after" };

export type Statement<K extends StatementId = StatementId> = {
  [Id in K]: { id: Id; params: StatementParams[Id]; highlight: Highlight };
}[K];

export type Section = { id: SectionId; statements: Statement[] };

/** The engine-only fallback: always available when the pipeline has a best move. */
export type EngineSummary = {
  playedSan: string;
  bestSan: string | null;
  playedIsBest: boolean;
  /** Evaluations from the mover's point of view, in pawns. */
  bestPawns: number | null;
  playedPawns: number | null;
};

export type Explanation = {
  sections: Section[];
  summary: EngineSummary;
  /** True when at least one fact-backed statement exists; false means "engine summary only". */
  confident: boolean;
};
