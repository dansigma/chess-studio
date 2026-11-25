"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { formatSanAtPly } from "@/src/chess/move-notation";
import { getNodeAt, pathAlongLine } from "@/src/chess/tree";
import type { SiteLocale } from "@/src/i18n/locale";
import { parseAnswer, type AnswerLine } from "@/src/lib/ask-master/answer-lines";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore, type BoardSession } from "@/src/store/studio-store";
import { openXdGame } from "../open-xd-game";
import type { AnswerSource } from "./ask-master-store";

function startPath(board: BoardSession, source: AnswerSource, line: AnswerLine) {
  if (board.id !== source.boardId) return null;
  const path = source.path.slice(0, line.startPly - source.lineStartPly);
  const fen = path.length ? getNodeAt(board.tree, path)?.fen : board.tree.startFen;
  return fen === line.startFen ? path : null;
}

function PlayableLine({ line, source }: { line: AnswerLine; source: AnswerSource }) {
  const board = useActiveBoard();
  const notation = useStudioStore((state) => state.settings.moveNotation);
  const blocked = useStudioStore((state) => Boolean(state.training || state.retry.active || state.setupMode));
  const previewKey = useId();
  const clearHover = useRef<(() => void) | null>(null);

  useEffect(() => () => clearHover.current?.(), [board.id, board.path, blocked]);

  function showArrow() {
    clearHover.current?.();
    const state = useStudioStore.getState();
    if (!startPath(state.active(), source, line) || state.training || state.retry.active || state.setupMode) return;
    if (state.enginePreview && state.enginePreview.fen !== line.startFen) return;

    const uci = line.moves[0].uci;
    const overlay = {
      fen: line.startFen,
      marks: { squares: [], arrows: [{ from: uci.slice(0, 2), to: uci.slice(2, 4), color: "G" as const }] },
    };
    const preview = state.fen() === line.startFen || state.enginePreview
      ? null
      : { fen: line.startFen, lastMove: "", key: previewKey };
    if (preview) state.setEnginePreview(preview);
    state.setInsightMarks(overlay);

    clearHover.current = () => {
      const current = useStudioStore.getState();
      if (current.enginePreview === preview && preview) current.setEnginePreview(null);
      if (current.insightMarks === overlay) current.setInsightMarks(null);
      clearHover.current = null;
    };
  }

  function play(index: number) {
    clearHover.current?.();
    const state = useStudioStore.getState();
    const active = state.active();
    const base = startPath(active, source, line);
    if (!base || state.training || state.retry.active || state.setupMode) return;
    const ucis = line.moves.map(({ uci }) => uci);
    if (state.enginePreview) state.setEnginePreview(null);
    if (!pathAlongLine(active.tree, base, ucis)) {
      state.goPath(base);
      state.insertEngineLines(line.startFen, [ucis]);
    }
    const target = pathAlongLine(state.active().tree, base, ucis.slice(0, index + 1));
    if (target) state.goPath(target);
  }

  if (blocked || !startPath(board, source, line)) return line.raw;
  const startSide = line.startPly % 2 ? "b" : "w";
  return (
    <span onMouseEnter={showArrow} onMouseLeave={() => clearHover.current?.()}>
      {line.moves.map(({ san }, index) => {
        const ply = line.startPly + index;
        const number = Math.floor(ply / 2) + 1;
        const prefix = ply % 2 === 0 ? `${number}.` : index === 0 ? `${number}...` : "";
        return (
          <Fragment key={index}>
            {index > 0 ? " " : null}
            <button
              type="button"
              className="inline whitespace-nowrap text-studio-accent-text underline underline-offset-2"
              onClick={() => play(index)}
              onFocus={showArrow}
              onBlur={() => clearHover.current?.()}
            >
              {prefix}{formatSanAtPly(san, notation, startSide, index)}
            </button>
          </Fragment>
        );
      })}
    </span>
  );
}

function CitedGame({ id, title, atFen, locale }: { id: string; title: string; atFen: string; locale: SiteLocale }) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      await openXdGame({ id, title, atFen, openInNewBoard: true }, locale);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="inline rounded-full bg-studio-accent-soft px-2 py-0.5 text-studio-accent-text hover:underline disabled:opacity-60"
      disabled={loading}
      onClick={open}
    >
      {title}
    </button>
  );
}

function renderParagraph(parts: ReactNode[]) {
  const rendered: ReactNode[] = [];
  let opening = -1;
  for (const part of parts) {
    if (part === "**") {
      if (opening >= 0 && opening < rendered.length - 1) {
        const bold = rendered.splice(opening);
        rendered.push(<strong key={opening}>{bold.slice(1)}</strong>);
        opening = -1;
        continue;
      }
      opening = rendered.length;
    } else if (part === "\n") {
      opening = -1;
    }
    rendered.push(part);
  }
  return rendered;
}

// Without a source no line can be resolved, so every line renders as text.
const NO_SOURCE = { currentFen: "", lineFens: [], lineStartPly: 0 } as const;

// SIG-1480: a heading is a line of its own, "### Title" or "**Title**".
const HEADING_LINE = /^( {0,3}(?:###[ \t]+\S.*|\*\*[^*\r\n]+\*\*)[ \t]*)$/m;
// "Title — text", "Title – text" or "Title: text" with a short title (at most 6 words).
const INLINE_HEADING = /^((?:\S+\s){0,5}\S+?)\s*(?:[\u2014\u2013]|\s-\s|:)\s+(\S[\s\S]*)$/;

export function AskMasterAnswer({ text, source, locale }: { text: string; source?: AnswerSource; locale: SiteLocale }) {
  const sections = text.split(new RegExp(HEADING_LINE.source, "gm"));
  if (sections.length === 1) return <AnswerBody text={text} source={source} locale={locale} />;
  return sections.map((part, index) => {
    const line = part.trim();
    if (!line) return null;
    if (index % 2 === 0) return <AnswerBody key={index} text={line} source={source} locale={locale} />;
    if (!line.startsWith("###")) {
      return <h3 key={index} className="text-dense font-semibold">{line.slice(2, -2).trim()}</h3>;
    }
    // Models often write the heading and its text on one line:
    // "### Conclusão — Jogue e6…". Only the part before the dash is the title.
    const heading = line.slice(3).trim();
    const inline = INLINE_HEADING.exec(heading);
    const title = inline ? inline[1] : heading;
    return (
      <Fragment key={index}>
        <h3 className="text-dense font-semibold">{title}</h3>
        {inline && <AnswerBody text={inline[2]} source={source} locale={locale} />}
      </Fragment>
    );
  });
}

type CitedGameRow = NonNullable<AnswerSource["xdGames"]>[number];

function citedGameTitle(game: CitedGameRow) {
  return `${game.white} – ${game.black}${game.year == null ? "" : `, ${game.year}`}`;
}

/** The answer with each {{game:ID}} citation replaced by its players and year, for copying as text. */
export function answerWithGameTitles(text: string, source?: AnswerSource) {
  return text.replace(/\{\{game:([^{}\r\n]*)\}\}/g, (citation, id: string) => {
    const game = source?.xdGames?.find((row) => row.id === id.trim());
    return game ? citedGameTitle(game) : citation;
  });
}

function AnswerBody({ text, source, locale }: { text: string; source?: AnswerSource; locale: SiteLocale }) {
  const segments = useMemo(() => parseAnswer(text, source ?? NO_SOURCE), [text, source]);
  const paragraphs: ReactNode[][] = [[]];
  for (const [index, segment] of segments.entries()) {
    if (segment.type === "game") {
      const game = source?.xdGames?.find(({ id }) => id === segment.id);
      if (game) {
        const title = citedGameTitle(game);
        paragraphs.at(-1)!.push(
          <CitedGame key={index} id={game.id} title={title} atFen={source!.currentFen} locale={locale} />,
        );
      }
      continue;
    }
    if (segment.type !== "text") {
      paragraphs.at(-1)!.push(segment.type === "line"
        ? source ? <PlayableLine key={`line-${index}`} line={segment} source={source} /> : segment.raw
        : <Fragment key={`line-${index}`}>{segment.raw}</Fragment>);
      continue;
    }
    for (const part of segment.text.split(/(\n(?:[^\S\n]*\n)+|\n|\*\*)/)) {
      if (/^\n[^\S\n]*\n/.test(part)) paragraphs.push([]);
      else if (part) paragraphs.at(-1)!.push(part);
    }
  }
  return paragraphs.map((parts, index) => (
    <p key={index} className="whitespace-pre-wrap">{renderParagraph(parts)}</p>
  ));
}
