// SIG-959: turns typed position facts into rows and board marks for the
// Insights panel. Pure (no React, no store) so it is unit-testable.
import type { ArrowMark, BoardMarks, MarkColor, SquareMark } from "@/src/chess/marks";
import type {
  Color,
  PieceFact,
  PieceType,
  PositionFacts,
  Threat,
  ThreatKind,
} from "@/src/chess/facts";
import type { InsightsLabelKey } from "./insights-labels";

const FILES = "abcdefgh";

type MarkBuilder = { squares: SquareMark[]; arrows: ArrowMark[] };

function builder(): MarkBuilder {
  return { squares: [], arrows: [] };
}

function square(b: MarkBuilder, sq: string, color: MarkColor): void {
  if (!b.squares.some((item) => item.square === sq)) {
    b.squares.push({ square: sq, color });
  }
}

function arrow(b: MarkBuilder, from: string, to: string, color: MarkColor): void {
  if (from !== to && !b.arrows.some((item) => item.from === from && item.to === to)) {
    b.arrows.push({ from, to, color });
  }
}

function done(b: MarkBuilder): BoardMarks {
  return { squares: b.squares, arrows: b.arrows };
}

export function fileSquares(file: string): string[] {
  return Array.from({ length: 8 }, (_, rank) => `${file}${rank + 1}`);
}

const DIAGONALS = {
  a1h8: Array.from({ length: 8 }, (_, k) => `${FILES[k]}${k + 1}`),
  h1a8: Array.from({ length: 8 }, (_, k) => `${FILES[7 - k]}${k + 1}`),
} as const;

export type PieceTag =
  | "hanging"
  | "pinned-absolute"
  | "pinned-relative"
  | "xray"
  | "blocked"
  | "trapped";

export const TAG_LABEL: Record<PieceTag, InsightsLabelKey> = {
  hanging: "tagHanging",
  "pinned-absolute": "tagPinnedAbsolute",
  "pinned-relative": "tagPinnedRelative",
  xray: "tagXray",
  blocked: "tagBlocked",
  trapped: "tagTrapped",
};

export type PieceRow = {
  id: string;
  color: Color;
  type: PieceType;
  square: string;
  tags: PieceTag[];
  marks: BoardMarks;
};

export function marksForPiece(piece: PieceFact): BoardMarks {
  const b = builder();
  square(b, piece.square, "B");
  for (const target of piece.attacksPieces) {
    arrow(b, piece.square, target, "R");
  }
  for (const target of piece.defends) {
    arrow(b, piece.square, target, "G");
  }
  for (const attacker of piece.attackers) {
    square(b, attacker, "R");
  }
  if (piece.pinned) {
    square(b, piece.pinned.by, "Y");
    arrow(b, piece.pinned.by, piece.pinned.to, "Y");
  }
  for (const xray of piece.xrayThrough) {
    arrow(b, piece.square, xray.target, "B");
    square(b, xray.through, "Y");
  }
  return done(b);
}

export function pieceTags(piece: PieceFact): PieceTag[] {
  const tags: PieceTag[] = [];
  if (piece.hanging) {
    tags.push("hanging");
  }
  if (piece.pinned) {
    tags.push(piece.pinned.kind === "absolute" ? "pinned-absolute" : "pinned-relative");
  }
  if (piece.xrayThrough.length > 0) {
    tags.push("xray");
  }
  if (piece.blocked) {
    tags.push("blocked");
  }
  if (piece.trapped) {
    tags.push("trapped");
  }
  return tags;
}

export function buildPieceRows(facts: PositionFacts): PieceRow[] {
  return facts.pieces.map((piece) => ({
    id: `${piece.color}${piece.type}${piece.square}`,
    color: piece.color,
    type: piece.type,
    square: piece.square,
    tags: pieceTags(piece),
    marks: marksForPiece(piece),
  }));
}

export function marksForThreat(threat: Threat, color: MarkColor = "R"): BoardMarks {
  const b = builder();
  arrow(b, threat.from, threat.to, color);
  for (const target of threat.targets) {
    square(b, target, color);
    if (threat.kind === "fork") {
      arrow(b, threat.to, target, color);
    }
  }
  return done(b);
}

export function marksForThreats(threats: Threat[], color: MarkColor = "R"): BoardMarks {
  return mergeBoardMarks(threats.map((threat) => marksForThreat(threat, color)));
}

export function mergeBoardMarks(parts: BoardMarks[]): BoardMarks {
  const b = builder();
  for (const part of parts) {
    for (const item of part.squares) {
      square(b, item.square, item.color);
    }
    for (const item of part.arrows) {
      arrow(b, item.from, item.to, item.color);
    }
  }
  return done(b);
}

export const THREAT_KIND_LABEL: Record<ThreatKind, InsightsLabelKey> = {
  "mate-in-1": "mate-in-1",
  "hanging-capture": "hanging-capture",
  "winning-capture": "winning-capture",
  fork: "fork",
};

export type ConceptItem = {
  id: string;
  label: InsightsLabelKey;
  color: Color | null;
  /** Anchors shown next to the label (file letters for file concepts). */
  squares: string[];
  marks: BoardMarks;
};

function concept(
  id: string,
  label: InsightsLabelKey,
  color: Color | null,
  squares: string[],
  marks: BoardMarks,
): ConceptItem {
  return { id, label, color, squares, marks };
}

function highlight(squares: string[], color: MarkColor): BoardMarks {
  const b = builder();
  for (const sq of squares) {
    square(b, sq, color);
  }
  return done(b);
}

export function buildConcepts(facts: PositionFacts): ConceptItem[] {
  const items: ConceptItem[] = [];
  for (const file of facts.files) {
    items.push(
      concept(
        `file:${file.file}`,
        file.openness === "open" ? "open-file" : "half-open-file",
        file.halfOpenFor,
        [file.file],
        highlight(fileSquares(file.file), file.openness === "open" ? "B" : "Y"),
      ),
    );
  }
  for (const seventh of facts.seventhRank) {
    items.push(
      concept(`seventh:${seventh.color}`, "seventh-rank", seventh.color, seventh.squares, highlight(seventh.squares, "G")),
    );
  }
  for (const diagonal of facts.diagonals) {
    items.push(
      concept(
        `diagonal:${diagonal.diagonal}`,
        "long-diagonal",
        diagonal.controller,
        diagonal.pieces,
        mergeBoardMarks([highlight([...DIAGONALS[diagonal.diagonal]], "B"), highlight(diagonal.pieces, "G")]),
      ),
    );
  }
  for (const weak of facts.weakSquares) {
    items.push(concept(`weak:${weak.side}${weak.square}`, "weak-square", weak.side, [weak.square], highlight([weak.square], "R")));
  }
  for (const outpost of facts.outposts) {
    items.push(concept(`outpost:${outpost.color}${outpost.square}`, "outpost", outpost.color, [outpost.square], highlight([outpost.square], "G")));
  }
  for (const pawn of facts.pawns) {
    const squares = [pawn.square, ...pawn.with];
    items.push(concept(`pawn:${pawn.kind}:${pawn.square}`, pawn.kind, pawn.color, squares, highlight(squares, pawn.kind === "passed" ? "G" : "Y")));
  }
  for (const skewer of facts.skewers) {
    const b = builder();
    arrow(b, skewer.by, skewer.front, "R");
    arrow(b, skewer.front, skewer.behind, "R");
    items.push(concept(`skewer:${skewer.by}`, "skewer", null, [skewer.by, skewer.front, skewer.behind], done(b)));
  }
  for (const king of facts.kings) {
    const b = builder();
    square(b, king.square, "B");
    for (const pawn of king.shieldPawns) {
      square(b, pawn, "G");
    }
    items.push(concept(`king:${king.color}`, king.castling, king.color, [king.square], done(b)));
    items.push(
      concept(
        `shield:${king.color}`,
        king.shieldIntact ? "shield-intact" : "shield-broken",
        king.color,
        [king.square, ...king.shieldPawns],
        done(b),
      ),
    );
    for (const open of king.openFiles) {
      items.push(
        concept(
          `king-file:${king.color}${open.file}`,
          "open-toward-king",
          king.color,
          [king.square],
          mergeBoardMarks([done(b), highlight(fileSquares(open.file), "R")]),
        ),
      );
    }
  }
  return items;
}
