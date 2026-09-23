"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRightToLine,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  MessageSquare,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Scissors,
  Trash2,
} from "lucide-react";
import {
  canMakeMainline,
  canPromote,
  getNodeAt,
  moveNumberForPath,
  plyColor,
  type Path,
  type TreeNode,
} from "@/src/chess/tree";
import type { GameHeaders } from "@/src/chess/pgn";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { formatMoveSuffix, formatPositionGlyphs } from "@/src/chess/nags";
import { formatSan } from "@/src/chess/move-notation";
import { MoveGlyphMenu, type GlyphMenuState } from "./MoveGlyphMenu";

function pathKey(path: Path): string {
  return path.join(".");
}

function displayDate(value: string | undefined): string | null {
  if (!value || value.startsWith("?") || value === "????.??.??") {
    return null;
  }
  const [year, month, day] = value.split(".");
  if (!year || year.includes("?")) {
    return null;
  }
  if (!month || month.includes("?")) {
    return year;
  }
  if (!day || day.includes("?")) {
    return `${year}.${month}`;
  }
  return value;
}

function displayEvent(value: string | undefined): string | null {
  if (!value || value === "?" || value === "Casual game") {
    return null;
  }
  return value;
}

function resultCaption(result: string | undefined): { mark: string; label: string } | null {
  if (result === "1-0") {
    return { mark: "1-0", label: "White wins" };
  }
  if (result === "0-1") {
    return { mark: "0-1", label: "Black wins" };
  }
  if (result === "1/2-1/2") {
    return { mark: "½-½", label: "Draw" };
  }
  return null;
}

function ToolButton({
  label,
  shortcut,
  disabled,
  active,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded text-studio-fg hover:bg-studio-hover disabled:text-studio-disabled disabled:hover:bg-transparent ${
        active ? "bg-studio-hover-strong text-studio-fg" : ""
      }`}
    >
      {children}
    </button>
  );
}

function CommentText({ text }: { text?: string }) {
  if (!text) {
    return null;
  }
  return <span className="px-1 italic text-studio-muted">{text}</span>;
}

function MoveToken({
  san,
  color,
  nags,
  active,
  onClick,
  onAnnotate,
}: {
  san: string;
  color: "w" | "b";
  nags?: number[];
  active: boolean;
  onClick: () => void;
  onAnnotate: (event: React.MouseEvent) => void;
}) {
  const style = useStudioStore((state) => state.settings.moveNotation);
  const suffix = formatMoveSuffix(nags);
  const rest = formatPositionGlyphs(nags);
  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        onClick={onClick}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onAnnotate(event);
        }}
        className={`rounded px-1 py-0.5 font-medium ${
          active ? "bg-studio-accent-move text-white" : "text-studio-fg hover:bg-studio-hover"
        }`}
      >
        {formatSan(san, style, color)}
        {suffix}
      </button>
      {rest ? (
        <span className={`pl-0.5 text-[12px] ${active ? "text-white" : "text-studio-fg"}`}>{rest}</span>
      ) : null}
    </span>
  );
}

function Line({
  nodes,
  parentPath,
  startFen,
  collapsed,
  onToggleCollapse,
  onAnnotate,
}: {
  nodes: TreeNode[];
  parentPath: Path;
  startFen: string;
  collapsed: Set<string>;
  onToggleCollapse: (key: string) => void;
  onAnnotate: (path: Path, event: React.MouseEvent) => void;
}) {
  const currentPath = useStudioStore((state) => {
    const board =
      state.boards.find((item) => item.id === state.activeBoardId) ?? state.boards[0];
    return pathKey(board.path);
  });
  const goPath = useStudioStore((state) => state.goPath);
  if (!nodes[0]) {
    return null;
  }

  const items: ReactNode[] = [];
  let cursor = nodes;
  let parent = parentPath;

  while (cursor[0]) {
    const node = cursor[0];
    const nodePath = [...parent, 0];
    const plyIndex = nodePath.length;
    const color = plyColor(startFen, plyIndex);
    const number = moveNumberForPath(startFen, plyIndex);
    const variations = cursor.slice(1);
    const collapseKey = pathKey(parent);
    const hideVariations = collapsed.has(collapseKey);

    if (color === "w") {
      items.push(
        <span key={`n-${pathKey(nodePath)}`} className="px-0.5 text-studio-faint">
          {number}.
        </span>,
      );
    } else if (parent.length === parentPath.length && color === "b") {
      items.push(
        <span key={`n-${pathKey(nodePath)}`} className="px-0.5 text-studio-faint">
          {number}...
        </span>,
      );
    }

    items.push(<CommentText key={`${node.id}-before`} text={node.commentBefore} />);
    items.push(
      <MoveToken
        key={node.id}
        san={node.san}
        color={color}
        nags={node.nags}
        active={currentPath === pathKey(nodePath)}
        onClick={() => goPath(nodePath)}
        onAnnotate={(event) => onAnnotate(nodePath, event)}
      />,
    );
    items.push(<CommentText key={`${node.id}-after`} text={node.comment} />);

    if (variations.length > 0) {
      items.push(
        <button
          key={`${node.id}-toggle`}
          type="button"
          title={hideVariations ? "Show variations" : "Hide variations"}
          onClick={() => onToggleCollapse(collapseKey)}
          className="mx-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-studio-hover text-[10px] text-studio-muted hover:bg-studio-hover-strong"
        >
          {hideVariations ? <Plus size={10} /> : <Minus size={10} />}
        </button>,
      );
    }

    if (!hideVariations) {
      variations.forEach((variation, index) => {
        const variationPath = [...parent, index + 1];
        items.push(
          <span
            key={`${node.id}-var-${variation.id}`}
            className="mx-1 inline-flex flex-wrap items-center gap-0.5 text-studio-muted"
          >
            (
            <CommentText text={variation.commentBefore} />
            {color === "b" ? (
              <span className="px-0.5 text-studio-faint">{number}...</span>
            ) : null}
            <MoveToken
              san={variation.san}
              color={color}
              nags={variation.nags}
              active={currentPath === pathKey(variationPath)}
              onClick={() => goPath(variationPath)}
              onAnnotate={(event) => onAnnotate(variationPath, event)}
            />
            <CommentText text={variation.comment} />
            {variation.children.length > 0 ? (
              <Line
                nodes={variation.children}
                parentPath={variationPath}
                startFen={startFen}
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                onAnnotate={onAnnotate}
              />
            ) : null}
            )
          </span>,
        );
      });
    }

    parent = nodePath;
    cursor = node.children;
  }

  return <span className="inline-flex flex-wrap items-center gap-0.5">{items}</span>;
}

function PlayerName({
  name,
  elo,
  fallback,
}: {
  name?: string;
  elo?: string;
  fallback: string;
}) {
  const shown = name && name !== "?" ? name : fallback;
  const muted = !name || name === "?" || name === fallback;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`text-[15px] font-semibold tracking-tight ${muted ? "text-studio-faint" : "text-studio-fg"}`}>
        {shown}
      </span>
      {elo ? <span className="text-[13px] font-medium text-studio-muted">{elo}</span> : null}
    </span>
  );
}

const HEADER_FIELDS: Array<{ key: keyof GameHeaders | string; label: string }> = [
  { key: "White", label: "White" },
  { key: "WhiteElo", label: "White rating" },
  { key: "Black", label: "Black" },
  { key: "BlackElo", label: "Black rating" },
  { key: "Event", label: "Event" },
  { key: "Site", label: "Site" },
  { key: "Date", label: "Date" },
  { key: "Round", label: "Round" },
];

function GameInfoDialog({
  headers,
  onClose,
  onSave,
}: {
  headers: GameHeaders;
  onClose: () => void;
  onSave: (headers: GameHeaders) => void;
}) {
  const [draft, setDraft] = useState<GameHeaders>({ ...headers });

  function setField(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-3">
      <form
        className="w-full max-w-md rounded-lg border border-studio-border bg-studio-elevated p-4 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          const next: GameHeaders = {};
          for (const [key, value] of Object.entries(draft)) {
            if (value.trim()) {
              next[key] = value.trim();
            }
          }
          onSave(next);
        }}
      >
        <h2 className="text-sm font-semibold text-studio-fg">Game information</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {HEADER_FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1 text-[11px] text-studio-muted">
              {field.label}
              <input
                value={draft[field.key] ?? ""}
                onChange={(event) => setField(field.key, event.target.value)}
                className="rounded border border-studio-border bg-studio-panel px-2 py-1.5 text-[13px] text-studio-fg outline-none focus:border-sky-600"
                placeholder={field.key === "Date" ? "YYYY.MM.DD" : undefined}
              />
            </label>
          ))}
          <label className="col-span-2 flex flex-col gap-1 text-[11px] text-studio-muted">
            Result
            <select
              value={draft.Result ?? "*"}
              onChange={(event) => setField("Result", event.target.value)}
              className="rounded border border-studio-border bg-studio-panel px-2 py-1.5 text-[13px] text-studio-fg outline-none focus:border-sky-600"
            >
              <option value="*">Ongoing *</option>
              <option value="1-0">White wins 1-0</option>
              <option value="0-1">Black wins 0-1</option>
              <option value="1/2-1/2">Draw 1/2-1/2</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm text-studio-muted hover:bg-studio-hover"
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className="rounded bg-studio-accent px-3 py-1.5 text-sm text-white">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

export function NotationPanel() {
  const board = useActiveBoard();
  const back = useStudioStore((state) => state.back);
  const forward = useStudioStore((state) => state.forward);
  const flip = useStudioStore((state) => state.flip);
  const toStart = useStudioStore((state) => state.toStart);
  const toEnd = useStudioStore((state) => state.toEnd);
  const skipForward = useStudioStore((state) => state.skipForward);
  const pruneAfter = useStudioStore((state) => state.pruneAfter);
  const promote = useStudioStore((state) => state.promoteVariation);
  const makeMain = useStudioStore((state) => state.makeMainline);
  const removeVariation = useStudioStore((state) => state.deleteVariation);
  const goPath = useStudioStore((state) => state.goPath);
  const setMoveComment = useStudioStore((state) => state.setMoveComment);
  const setMoveCommentBefore = useStudioStore((state) => state.setMoveCommentBefore);
  const toggleMoveNag = useStudioStore((state) => state.toggleMoveNag);
  const clearMoveNags = useStudioStore((state) => state.clearMoveNags);
  const setHeaders = useStudioStore((state) => state.setHeaders);
  const editor = useStudioStore((state) => state.notationEditor);
  const setEditor = useStudioStore((state) => state.setNotationEditor);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draftComment, setDraftComment] = useState("");
  const [glyphMenu, setGlyphMenu] = useState<GlyphMenuState | null>(null);

  const current = getNodeAt(board.tree, board.path);
  const currentComment =
    board.path.length === 0 ? board.tree.startComment ?? "" : current?.comment ?? "";
  const currentBefore = current?.commentBefore ?? "";
  const date = displayDate(board.headers.Date);
  const event = displayEvent(board.headers.Event);
  const result = resultCaption(board.headers.Result);
  const commentOpen = editor === "comment";
  const commentBeforeOpen = editor === "commentBefore";
  const headersOpen = editor === "headers";

  useEffect(() => {
    if (commentOpen) {
      setDraftComment(currentComment);
    }
    if (commentBeforeOpen) {
      setDraftComment(currentBefore);
    }
  }, [commentOpen, commentBeforeOpen, currentComment, currentBefore, board.id, pathKey(board.path)]);

  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const moveLabel = useMemo(() => {
    if (!current) {
      return "start position";
    }
    const color = plyColor(board.tree.startFen, board.path.length);
    const number = moveNumberForPath(board.tree.startFen, board.path.length);
    return `${number}${color === "w" ? "." : "..."} ${formatSan(current.san, moveNotation, color)}`;
  }, [board.path, board.tree.startFen, current, moveNotation]);

  function toggleCollapse(key: string) {
    setCollapsed((currentSet) => {
      const next = new Set(currentSet);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="relative flex h-full flex-col bg-studio-panel text-sm text-studio-fg">
      <div className="flex items-start justify-between gap-3 border-b border-studio-border-subtle px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <PlayerName name={board.headers.White} elo={board.headers.WhiteElo} fallback="White" />
            <span className="text-[12px] text-studio-faint">vs</span>
            <PlayerName name={board.headers.Black} elo={board.headers.BlackElo} fallback="Black" />
          </div>
          {event ? <div className="mt-0.5 truncate text-[12px] text-studio-muted">{event}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[12px] text-studio-muted">
          {date ? <span className="tabular-nums">{date}</span> : <span className="text-studio-faint">No date</span>}
          <button
            type="button"
            title="Edit game information"
            className="rounded p-1 text-studio-faint hover:bg-studio-hover hover:text-studio-fg"
            onClick={() => setEditor("headers")}
          >
            <Pencil size={13} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-0.5 border-b border-studio-border-subtle px-1.5 py-1">
        <ToolButton label="Start" shortcut="Home" onClick={toStart}>
          <ChevronsLeft size={15} />
        </ToolButton>
        <ToolButton label="Back" shortcut="←" onClick={back}>
          <ChevronLeft size={15} />
        </ToolButton>
        <ToolButton label="Forward" shortcut="→" onClick={forward}>
          <ChevronRight size={15} />
        </ToolButton>
        <ToolButton label="Skip forward" onClick={skipForward}>
          <ChevronsRight size={15} />
        </ToolButton>
        <ToolButton label="End" shortcut="End" onClick={toEnd}>
          <ArrowRightToLine size={15} />
        </ToolButton>
        <ToolButton label="Flip board" shortcut="Ctrl+F" onClick={flip}>
          <RefreshCw size={14} />
        </ToolButton>
        <div className="mx-1 h-4 w-px bg-studio-hover" />
        <ToolButton
          label="Edit annotations"
          shortcut="Ctrl+A"
          active={commentOpen}
          onClick={() => setEditor(commentOpen ? null : "comment")}
        >
          <MessageSquare size={14} />
        </ToolButton>
        <ToolButton
          label="Promote variation"
          shortcut="Ctrl+↑"
          disabled={!canPromote(board.path)}
          onClick={promote}
        >
          <ArrowUp size={14} />
        </ToolButton>
        <ToolButton
          label="Make mainline"
          shortcut="Ctrl+Shift+↑"
          disabled={!canMakeMainline(board.path)}
          onClick={makeMain}
        >
          <ChevronsUp size={14} />
        </ToolButton>
        <ToolButton label="Delete after" shortcut="Del" onClick={pruneAfter}>
          <Scissors size={14} />
        </ToolButton>
        <ToolButton
          label="Delete variation"
          shortcut="Ctrl+Del"
          disabled={board.path.length === 0}
          onClick={removeVariation}
        >
          <Trash2 size={14} />
        </ToolButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 leading-7">
        {board.tree.startComment ? (
          <div className="mb-2 italic text-studio-muted">{board.tree.startComment}</div>
        ) : null}
        {board.tree.children.length === 0 ? (
          <div className="text-studio-faint">Make a move on the board.</div>
        ) : (
          <Line
            nodes={board.tree.children}
            parentPath={[]}
            startFen={board.tree.startFen}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            onAnnotate={(path, event) => {
              goPath(path);
              setGlyphMenu({ x: event.clientX, y: event.clientY, path });
            }}
          />
        )}
        {result ? (
          <div className="mt-6 text-center">
            <div className="text-lg font-semibold text-studio-fg">{result.mark}</div>
            <div className="text-[12px] text-studio-faint">{result.label}</div>
          </div>
        ) : null}
      </div>

      {commentOpen || commentBeforeOpen ? (
        <div className="border-t border-studio-border bg-studio-chrome p-3">
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-studio-faint">
            {commentBeforeOpen ? "Comment before" : "Comment"} · {moveLabel}
          </div>
          <textarea
            value={draftComment}
            onChange={(event) => {
              setDraftComment(event.target.value);
              if (commentBeforeOpen) {
                setMoveCommentBefore(event.target.value);
              } else {
                setMoveComment(event.target.value);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setEditor(null);
              }
            }}
            placeholder={
              commentBeforeOpen
                ? "Write a note that appears before this move…"
                : "Write a note for this move or the starting position…"
            }
            className="h-24 w-full resize-none rounded border border-studio-border bg-studio-panel px-2 py-1.5 text-[13px] text-studio-fg outline-none focus:border-sky-600"
            autoFocus
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="rounded bg-studio-accent px-3 py-1 text-[12px] text-white"
              onClick={() => setEditor(null)}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {glyphMenu ? (
        <MoveGlyphMenu
          menu={glyphMenu}
          nags={getNodeAt(board.tree, glyphMenu.path)?.nags ?? []}
          onToggle={(nag) => toggleMoveNag(nag, glyphMenu.path)}
          onClear={() => {
            clearMoveNags(glyphMenu.path);
            setGlyphMenu(null);
          }}
          onComment={() => {
            setEditor("comment");
            setGlyphMenu(null);
          }}
          onClose={() => setGlyphMenu(null)}
        />
      ) : null}

      {headersOpen ? (
        <GameInfoDialog
          headers={board.headers}
          onClose={() => setEditor(null)}
          onSave={(headers) => {
            setHeaders(headers);
            setEditor(null);
          }}
        />
      ) : null}
    </div>
  );
}
