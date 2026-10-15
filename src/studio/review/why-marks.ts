// SIG-961: turns a statement's highlight into transient board marks. Pure; the
// marks go through the Insights hover channel, never the game tree.
import type { BoardMarks, MarkColor } from "@/src/chess/marks";
import type { SectionId, Statement } from "@/src/chess/explain/model";

const SECTION_COLOR: Record<SectionId, MarkColor> = {
  move: "B",
  consequences: "R",
  alternative: "G",
};

export function marksForStatement(statement: Statement, section: SectionId): BoardMarks {
  const color = SECTION_COLOR[section];
  const squares = [...new Set(statement.highlight.squares)];
  return {
    squares: squares.map((square) => ({ square, color })),
    arrows: statement.highlight.arrows
      .filter((arrow) => arrow.from !== arrow.to)
      .map((arrow) => ({ from: arrow.from, to: arrow.to, color })),
  };
}
