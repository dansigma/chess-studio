"use client";

import { useCallback, useMemo, useState } from "react";
import { getNodeAt, moveNumberForPath, plyColor, type Path } from "@/src/chess/tree";
import { useActiveBoard, useActivePathKey } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { formatSan } from "@/src/chess/move-notation";
import { GameInfoDialog } from "./GameInfoDialog";
import { NotationCommentEditor } from "./NotationCommentEditor";
import { NotationHeader } from "./NotationHeader";
import { NotationToolbar } from "./NotationToolbar";
import { MoveGlyphMenu, type GlyphMenuState } from "./MoveGlyphMenu";
import { pgnResultCaption } from "./ResultMark";
import { Line } from "./NotationMoves";
import { displayDate, displayEvent } from "./notation-format";
import { useNotationCommentDraft } from "./use-notation-comment-draft";

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
  const [glyphMenu, setGlyphMenu] = useState<GlyphMenuState | null>(null);

  const current = getNodeAt(board.tree, board.path);
  const currentComment =
    board.path.length === 0 ? board.tree.startComment ?? "" : current?.comment ?? "";
  const currentBefore = current?.commentBefore ?? "";
  const date = displayDate(board.headers.Date);
  const event = displayEvent(board.headers.Event);
  const result = pgnResultCaption(board.headers.Result);
  const commentOpen = editor === "comment";
  const commentBeforeOpen = editor === "commentBefore";
  const headersOpen = editor === "headers";

  const { draftComment, setDraftComment, commitDraftComment } = useNotationCommentDraft({
    editor,
    boardId: board.id,
    path: board.path,
    currentComment,
    currentBefore,
    setComment: setMoveComment,
    setCommentBefore: setMoveCommentBefore,
  });

  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const notationDensity = useStudioStore((state) => state.settings.notationDensity);
  const compact = notationDensity === "compact";
  // SIG-857: single shared path-key subscription — Line rows receive it as a
  // prop instead of each subscribing with an inline find.
  const currentPath = useActivePathKey();
  const moveLabel = useMemo(() => {
    if (!current) {
      return "start position";
    }
    const color = plyColor(board.tree.startFen, board.path.length);
    const number = moveNumberForPath(board.tree.startFen, board.path.length);
    return `${number}${color === "w" ? "." : "..."} ${formatSan(current.san, moveNotation, color)}`;
  }, [board.path, board.tree.startFen, current, moveNotation]);

  // SIG-857: stabilized so memoized Line rows skip re-render unless their
  // props (nodes/path/collapsed/currentPath) actually change.
  const handleToggleCollapse = useCallback((key: string) => {
    setCollapsed((currentSet) => {
      const next = new Set(currentSet);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleAnnotate = useCallback(
    (path: Path, event: React.MouseEvent) => {
      goPath(path);
      setGlyphMenu({ x: event.clientX, y: event.clientY, path });
    },
    [goPath],
  );

  return (
    <div className="relative flex h-full flex-col bg-studio-panel text-sm text-studio-fg">
      <NotationHeader
        headers={board.headers}
        date={date}
        event={event}
        onEdit={() => setEditor("headers")}
      />

      <NotationToolbar
        path={board.path}
        commentOpen={commentOpen}
        onStart={toStart}
        onBack={back}
        onForward={forward}
        onSkipForward={skipForward}
        onEnd={toEnd}
        onFlip={flip}
        onToggleComment={() => setEditor(commentOpen ? null : "comment")}
        onPromote={promote}
        onMakeMainline={makeMain}
        onDeleteAfter={pruneAfter}
        onDeleteVariation={removeVariation}
      />

      <div
        className={`min-h-0 flex-1 overflow-auto text-body ${compact ? "p-2 text-dense leading-5" : "p-3 leading-6"}`}
      >
        {board.tree.startComment ? (
          <div className="mb-2 border-l-2 border-studio-comment/40 pl-2 text-studio-comment">
            {board.tree.startComment}
          </div>
        ) : null}
        {board.tree.children.length === 0 ? (
          <div className="text-studio-faint">Make a move on the board.</div>
        ) : (
          <div className={compact ? "inline leading-5" : "flex flex-wrap items-center gap-0.5"}>
            <Line
              nodes={board.tree.children}
              parentPath={[]}
              startFen={board.tree.startFen}
              collapsed={collapsed}
              currentPath={currentPath}
              style={moveNotation}
              density={notationDensity}
              goPath={goPath}
              onToggleCollapse={handleToggleCollapse}
              onAnnotate={handleAnnotate}
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
        <NotationCommentEditor
          commentBefore={commentBeforeOpen}
          moveLabel={moveLabel}
          value={draftComment}
          onChange={setDraftComment}
          onCommit={commitDraftComment}
          onClose={() => setEditor(null)}
        />
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
