// SIG-959: typed position facts. Everything here is plain data with stable
// ids (`kind`, squares, piece types) — no sentences. Wording belongs to the
// presentation layer.

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export type PinFact = {
  kind: "absolute" | "relative";
  /** Square of the pinning slider. */
  by: string;
  /** Square of the piece shielded by the pinned one (the king when absolute). */
  to: string;
};

export type XrayFact = {
  /** First piece on the ray (the one the slider "sees through"). */
  through: string;
  /** Next piece on the ray, an opponent's non-pawn piece. */
  target: string;
};

export type PieceFact = {
  square: string;
  type: PieceType;
  color: Color;
  /** Every square the piece attacks or defends, occupied or not. */
  attacks: string[];
  /** Opponent pieces attacked by this piece. */
  attacksPieces: string[];
  /** Own pieces defended by this piece. */
  defends: string[];
  /** Opponent pieces attacking this square. */
  attackers: string[];
  /** Own pieces defending this square. */
  defenders: string[];
  /** Attacked and either undefended or attacked by something cheaper. */
  hanging: boolean;
  pinned: PinFact | null;
  xrayThrough: XrayFact[];
  /** Pawn whose forward square is occupied. */
  blocked: boolean;
  /** Attacked piece (not pawn/king) with no safe square to go to. */
  trapped: boolean;
  /** Reachable squares where the piece is not simply lost. */
  safeSquares: string[];
};

export type SkewerFact = {
  /** Slider delivering the skewer. */
  by: string;
  /** Front piece (the more valuable one, or the king). */
  front: string;
  /** Piece behind it on the same ray. */
  behind: string;
};

export type FileFact = {
  file: string;
  openness: "open" | "half-open";
  /** For half-open files: the side with no pawn on the file. */
  halfOpenFor: Color | null;
  /** Rooks and queens standing on the file. */
  heavyPieces: string[];
};

export type SeventhRankFact = {
  color: Color;
  /** Rooks/queens on the seventh rank counted from `color`'s side. */
  squares: string[];
};

export type DiagonalFact = {
  diagonal: "a1h8" | "h1a8";
  /** Side that is alone in controlling the diagonal, null when contested. */
  controller: Color | null;
  /** Bishops/queens with a clear line to the central squares of the diagonal. */
  pieces: string[];
};

export type PawnKind = "isolated" | "doubled" | "passed" | "backward";

export type PawnFact = {
  kind: PawnKind;
  color: Color;
  square: string;
  /** Other pawns involved (the rest of a doubled file). */
  with: string[];
};

export type WeakSquareFact = {
  /** Side that cannot challenge the square with a pawn. */
  side: Color;
  square: string;
};

export type OutpostFact = {
  color: Color;
  square: string;
  /** Knight or bishop of `color` standing there. */
  occupant: "n" | "b";
};

export type KingSafetyFact = {
  color: Color;
  square: string;
  castling: "castled" | "uncastled";
  canCastle: { king: boolean; queen: boolean };
  shieldPawns: string[];
  /** Files next to the king with no pawn within two ranks of it. */
  missingShieldFiles: string[];
  shieldIntact: boolean;
  /** Files around the king with no own pawn. */
  openFiles: Array<{ file: string; openness: "open" | "half-open" }>;
};

export type PositionFacts = {
  fen: string;
  valid: boolean;
  turn: Color;
  pieces: PieceFact[];
  skewers: SkewerFact[];
  files: FileFact[];
  seventhRank: SeventhRankFact[];
  diagonals: DiagonalFact[];
  pawns: PawnFact[];
  weakSquares: WeakSquareFact[];
  outposts: OutpostFact[];
  kings: KingSafetyFact[];
};

export type ThreatKind = "mate-in-1" | "hanging-capture" | "winning-capture" | "fork";

export type Threat = {
  /** Stable id: `${kind}:${uci}`. */
  id: string;
  kind: ThreatKind;
  by: Color;
  from: string;
  to: string;
  uci: string;
  /** Squares of the pieces being threatened (or the king mated). */
  targets: string[];
};

export type ThreatStatus = "ok" | "in-check" | "game-over" | "invalid";

export type ThreatSet = {
  by: Color;
  status: ThreatStatus;
  threats: Threat[];
};

export type ThreatComparison = {
  mover: Color;
  /** Opponent threats against the mover in the position before the move. */
  before: ThreatSet;
  /** Opponent threats standing after the move (opponent to move). */
  after: ThreatSet;
  /** Mover's follow-up threats that were not available before the move. */
  created: ThreatSet;
  /** In `before` but gone from `after`. */
  neutralized: Threat[];
  /** In both. */
  persisting: Threat[];
  /** In `after` but not in `before`. */
  exposed: Threat[];
};

export type PvFacts = {
  /** Legal prefix of the supplied continuation, as UCI. */
  moves: string[];
  /** Material swing for the mover at the end of the line (pawns). */
  materialDelta: number;
  /** Worst material swing seen when it was the mover's turn again. */
  minMaterialDelta: number;
  endsInMate: boolean;
};

export type MoveFacts = {
  uci: string;
  san: string;
  mover: Color;
  piece: PieceType;
  from: string;
  to: string;
  promotion: PieceType | null;
  capture: { type: PieceType; square: string; enPassant: boolean } | null;
  castle: "k" | "q" | null;
  check: boolean;
  mate: boolean;
  sacrifice: boolean;
  /** Opponent pieces attacked by the moved piece afterwards. */
  attacks: string[];
  /** Own pieces defended by the moved piece afterwards. */
  defends: string[];
  /** Squares the mover's side attacks now but did not before. */
  newlyControlled: string[];
  /** Own pieces whose lines opened because of the move. */
  unblocks: Array<{ square: string; gained: string[] }>;
  /** Opponent pieces whose lines were cut by the move. */
  blocks: Array<{ square: string; lost: string[] }>;
  threats: {
    neutralized: Threat[];
    created: Threat[];
    exposed: Threat[];
  };
  pv: PvFacts | null;
};
