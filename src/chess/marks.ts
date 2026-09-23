export type MarkColor = "G" | "Y" | "R" | "B";

export type SquareMark = {
  color: MarkColor;
  square: string;
};

export type ArrowMark = {
  color: MarkColor;
  from: string;
  to: string;
};

export type BoardMarks = {
  squares: SquareMark[];
  arrows: ArrowMark[];
};

export const MARK_HEX: Record<MarkColor, string> = {
  G: "#22c55e",
  Y: "#eab308",
  R: "#ef4444",
  B: "#3b82f6",
};

export const MARK_FILL: Record<MarkColor, string> = {
  G: "rgba(34, 197, 94, 0.62)",
  Y: "rgba(234, 179, 8, 0.62)",
  R: "rgba(239, 68, 68, 0.62)",
  B: "rgba(59, 130, 246, 0.62)",
};

const SQUARE_RE = /^[a-h][1-8]$/;
const COLOR_RE = /^[GYRB]$/;

export function emptyMarks(): BoardMarks {
  return { squares: [], arrows: [] };
}

export function marksAreEmpty(marks: BoardMarks | undefined): boolean {
  return !marks || (marks.squares.length === 0 && marks.arrows.length === 0);
}

export function colorFromModifiers(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): MarkColor {
  if (event.ctrlKey || event.metaKey) {
    return "R";
  }
  if (event.shiftKey || event.altKey) {
    return "Y";
  }
  return "G";
}

function normalizeColor(value: string): MarkColor | null {
  const color = value.toUpperCase();
  return COLOR_RE.test(color) ? (color as MarkColor) : null;
}

export function toggleSquareMark(marks: BoardMarks, square: string, color: MarkColor): BoardMarks {
  if (!SQUARE_RE.test(square)) {
    return marks;
  }
  const existing = marks.squares.find((item) => item.square === square);
  if (existing?.color === color) {
    return {
      ...marks,
      squares: marks.squares.filter((item) => item.square !== square),
    };
  }
  return {
    ...marks,
    squares: [...marks.squares.filter((item) => item.square !== square), { square, color }],
  };
}

export function arrowsForRender(
  arrows: ArrowMark[],
  preview?: { from: string; to: string; color: MarkColor } | null,
): Array<{ startSquare: string; endSquare: string; color: string }> {
  const seen = new Set<string>();
  const list: Array<{ startSquare: string; endSquare: string; color: string }> = [];
  const push = (from: string, to: string, color: MarkColor) => {
    if (!SQUARE_RE.test(from) || !SQUARE_RE.test(to) || from === to) {
      return;
    }
    const key = `${from}${to}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    list.push({ startSquare: from, endSquare: to, color: MARK_HEX[color] });
  };
  for (const arrow of arrows) {
    push(arrow.from, arrow.to, arrow.color);
  }
  if (preview) {
    push(preview.from, preview.to, preview.color);
  }
  return list;
}

export function toggleArrowMark(
  marks: BoardMarks,
  from: string,
  to: string,
  color: MarkColor,
): BoardMarks {
  if (!SQUARE_RE.test(from) || !SQUARE_RE.test(to) || from === to) {
    return marks;
  }
  const existing = marks.arrows.find((item) => item.from === from && item.to === to);
  if (existing?.color === color) {
    return {
      ...marks,
      arrows: marks.arrows.filter((item) => !(item.from === from && item.to === to)),
    };
  }
  return {
    ...marks,
    arrows: [
      ...marks.arrows.filter((item) => !(item.from === from && item.to === to)),
      { from, to, color },
    ],
  };
}

export function compactMarks(marks: BoardMarks): BoardMarks | undefined {
  return marksAreEmpty(marks) ? undefined : marks;
}

export function marksFromPgnArrays(
  colorFields?: string[],
  colorArrows?: string[],
): BoardMarks | undefined {
  const marks = emptyMarks();
  marks.squares.push(...parseSquareList((colorFields ?? []).join(",")));
  marks.arrows.push(...parseArrowList((colorArrows ?? []).join(",")));
  return compactMarks(marks);
}

export function mergeMarks(...parts: Array<BoardMarks | undefined>): BoardMarks | undefined {
  const marks = emptyMarks();
  for (const part of parts) {
    if (!part) {
      continue;
    }
    marks.squares.push(...part.squares);
    marks.arrows.push(...part.arrows);
  }
  return compactMarks(marks);
}

function parseSquareList(list: string): SquareMark[] {
  const squares: SquareMark[] = [];
  for (const token of list.split(/[,;\s]+/)) {
    const match = token.trim().match(/^([GYRBgyrb])([a-h][1-8])$/);
    if (!match?.[1] || !match[2]) {
      continue;
    }
    const color = normalizeColor(match[1]);
    if (color) {
      squares.push({ color, square: match[2] });
    }
  }
  return squares;
}

function parseArrowList(list: string): ArrowMark[] {
  const arrows: ArrowMark[] = [];
  for (const token of list.split(/[,;\s]+/)) {
    const match = token.trim().match(/^([GYRBgyrb])([a-h][1-8])([a-h][1-8])$/);
    if (!match?.[1] || !match[2] || !match[3] || match[2] === match[3]) {
      continue;
    }
    const color = normalizeColor(match[1]);
    if (color) {
      arrows.push({ color, from: match[2], to: match[3] });
    }
  }
  return arrows;
}

export function stripMarkTokens(text: string): string {
  return text
    .replace(/\[%(?:csl|cal)\s+[^\]]*\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMarksFromComment(comment: string | undefined): {
  text?: string;
  marks?: BoardMarks;
} {
  if (!comment) {
    return {};
  }
  const marks = emptyMarks();
  const csl = [...comment.matchAll(/\[%csl\s+([^\]]+)\]/gi)];
  const cal = [...comment.matchAll(/\[%cal\s+([^\]]+)\]/gi)];
  for (const match of csl) {
    if (match[1]) {
      marks.squares.push(...parseSquareList(match[1]));
    }
  }
  for (const match of cal) {
    if (match[1]) {
      marks.arrows.push(...parseArrowList(match[1]));
    }
  }
  const text = stripMarkTokens(comment);
  return {
    text: text || undefined,
    marks: compactMarks(marks),
  };
}

export function formatMarksPgn(marks: BoardMarks | undefined): string {
  if (marksAreEmpty(marks) || !marks) {
    return "";
  }
  const parts: string[] = [];
  if (marks.squares.length > 0) {
    parts.push(`[%csl ${marks.squares.map((item) => `${item.color}${item.square}`).join(",")}]`);
  }
  if (marks.arrows.length > 0) {
    parts.push(
      `[%cal ${marks.arrows.map((item) => `${item.color}${item.from}${item.to}`).join(",")}]`,
    );
  }
  return parts.join(" ");
}

export function formatCommentWithMarks(
  text: string | undefined,
  marks: BoardMarks | undefined,
): string | undefined {
  const glyphs = formatMarksPgn(marks);
  const clean = stripMarkTokens(text ?? "");
  const body = [glyphs, clean].filter(Boolean).join(" ");
  return body || undefined;
}
