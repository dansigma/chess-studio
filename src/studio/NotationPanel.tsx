"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import { Button, IconButton } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

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
    <IconButton label={label} shortcut={shortcut} disabled={disabled} active={active} onClick={onClick}>
      {children}
    </IconButton>
  );
}

function CommentText({ text }: { text?: string }) {
  if (!text) {
    return null;
  }
  return <span className="px-1 text-studio-comment">{text}</span>;
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
        className={`rounded-[5px] px-1 py-0.5 font-medium leading-5 ${
          active ? "bg-studio-accent-move text-studio-accent-fg" : "hover:bg-studio-hover-strong"
        }`}
      >
        {formatSan(san, style, color)}
        {suffix}
      </button>
      {rest ? <span className="pl-0.5 text-dense text-studio-muted">{rest}</span> : null}
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
  continuation = false,
}: {
  nodes: TreeNode[];
  parentPath: Path;
  startFen: string;
  collapsed: Set<string>;
  onToggleCollapse: (key: string) => void;
  onAnnotate: (path: Path, event: React.MouseEvent) => void;
  continuation?: boolean;
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
  let resumeAfterVariation = false;

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
    } else if (((parent.length === parentPath.length && !continuation) || resumeAfterVariation) && color === "b") {
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
          className="mx-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-studio-hover text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
        >
          {hideVariations ? <Plus size={10} /> : <Minus size={10} />}
        </button>,
      );
    }

    resumeAfterVariation = !hideVariations && variations.length > 0;
    if (!hideVariations) {
      variations.forEach((variation, index) => {
        const variationPath = [...parent, index + 1];
        items.push(
          <span
            key={`${node.id}-var-${variation.id}`}
            className="my-0.5 ml-1.5 flex basis-full flex-wrap items-center gap-0.5 border-l-2 border-studio-border-strong pl-2 text-dense text-studio-muted"
          >
            <CommentText text={variation.commentBefore} />
            <span className="px-0.5 text-studio-faint">
              {number}
              {color === "b" ? "..." : "."}
            </span>
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
                continuation
              />
            ) : null}
          </span>,
        );
      });
    }

    parent = nodePath;
    cursor = node.children;
  }

  return <>{items}</>;
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
      <span className={`text-title font-semibold tracking-tight ${muted ? "text-studio-faint" : "text-studio-fg"}`}>
        {shown}
      </span>
      {elo ? <span className="text-body font-medium tabular-nums text-studio-muted">{elo}</span> : null}
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

  const fieldClass =
    "h-8 rounded-md border border-studio-border-strong bg-studio-panel px-2 text-body text-studio-fg outline-none focus:border-studio-accent";
  return (
    <Dialog
      title="Game information"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" form="game-info-form">
            Save
          </Button>
        </>
      }
    >
      <form
        id="game-info-form"
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
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {HEADER_FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1 text-caption text-studio-muted">
              {field.label}
              <input
                value={draft[field.key] ?? ""}
                onChange={(event) => setField(field.key, event.target.value)}
                className={fieldClass}
                placeholder={field.key === "Date" ? "YYYY.MM.DD" : undefined}
              />
            </label>
          ))}
          <label className="col-span-2 flex flex-col gap-1 text-caption text-studio-muted">
            Result
            <select
              value={draft.Result ?? "*"}
              onChange={(event) => setField("Result", event.target.value)}
              className={fieldClass}
            >
              <option value="*">Ongoing *</option>
              <option value="1-0">White wins 1-0</option>
              <option value="0-1">Black wins 0-1</option>
              <option value="1/2-1/2">Draw 1/2-1/2</option>
            </select>
          </label>
        </div>
      </form>
    </Dialog>
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

  const editedComment = commentOpen ? currentComment : commentBeforeOpen ? currentBefore : null;
  const draftSource =
    editedComment === null ? null : `${editor}|${board.id}|${pathKey(board.path)}|${editedComment}`;
  const [syncedDraftSource, setSyncedDraftSource] = useState<string | null>(null);
  if (syncedDraftSource !== draftSource) {
    setSyncedDraftSource(draftSource);
    if (editedComment !== null) {
      setDraftComment(editedComment);
    }
  }

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
            <span className="text-dense text-studio-faint">vs</span>
            <PlayerName name={board.headers.Black} elo={board.headers.BlackElo} fallback="Black" />
          </div>
          {event ? <div className="mt-0.5 truncate text-dense text-studio-muted">{event}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5 text-dense text-studio-muted">
          {date ? <span className="tabular-nums">{date}</span> : <span className="text-studio-faint">No date</span>}
          <IconButton
            label="Edit game information"
            size="sm"
            className="text-studio-faint hover:text-studio-fg"
            onClick={() => setEditor("headers")}
          >
            <Pencil size={13} />
          </IconButton>
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
        <div className="mx-1 h-4 w-px bg-studio-border-strong" />
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

      <div className="min-h-0 flex-1 overflow-auto p-3 text-body leading-6">
        {board.tree.startComment ? (
          <div className="mb-2 border-l-2 border-studio-comment/40 pl-2 text-studio-comment">
            {board.tree.startComment}
          </div>
        ) : null}
        {board.tree.children.length === 0 ? (
          <div className="text-studio-faint">Make a move on the board.</div>
        ) : (
          <div className="flex flex-wrap items-center gap-0.5">
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
          </div>
        )}
        {result ? (
          <div className="mt-5 flex items-center justify-center gap-2 border-t border-studio-border-subtle pt-3">
            <span className="rounded-[5px] bg-studio-hover-strong px-2 py-0.5 text-body font-semibold tabular-nums text-studio-fg">
              {result.mark}
            </span>
            <span className="text-dense text-studio-faint">{result.label}</span>
          </div>
        ) : null}
      </div>

      {commentOpen || commentBeforeOpen ? (
        <div className="border-t border-studio-border bg-studio-chrome p-3">
          <div className="mb-1.5 text-caption uppercase tracking-wider text-studio-faint">
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
            className="h-24 w-full resize-none rounded-md border border-studio-border-strong bg-studio-panel px-2 py-1.5 text-body text-studio-fg outline-none focus:border-studio-accent"
            autoFocus
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="primary" onClick={() => setEditor(null)}>
              Done
            </Button>
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
