"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { formatSan } from "@/src/chess/move-notation";
import {
  canMakeMainline,
  canPromote,
  continuationsAt,
  getNodeAt,
  plyColor,
  type GameTree,
  type Path,
} from "@/src/chess/tree";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NotationContextMenu, notationMenuEnablement, type NotationMenuState } from "./NotationContextMenu";
import { createLongPress, touchPoint } from "./use-gestures";

// SIG-1043: mobile move strip shows the current line's mainline SANs in a
// horizontally scrollable row. Variations stay a desktop concern (SIG-1108).

export type MobileStripMove = {
  san: string;
  path: Path;
};

export type MobileStripModel = {
  moves: MobileStripMove[];
  currentIndex: number;
};

export function mobileStripModel(tree: GameTree, path: Path): MobileStripModel {
  const moves: MobileStripMove[] = [];
  let nodes = tree.children;
  let cursor: Path = [];
  let currentIndex = -1;
  // Walk from root along the active path so variations surface their moves.
  for (const index of path) {
    const node = nodes[index];
    if (!node) {
      break;
    }
    cursor = [...cursor, index];
    moves.push({ san: node.san, path: cursor });
    currentIndex = moves.length - 1;
    nodes = node.children;
  }
  // Continue along the current node's mainline (first-child spine).
  while (nodes[0]) {
    const node = nodes[0];
    cursor = [...cursor, 0];
    moves.push({ san: node.san, path: cursor });
    nodes = node.children;
  }
  return { moves, currentIndex };
}

// SIG-1109: long-pressing a strip move opens the same NotationContextMenu as
// desktop right-click (touch browsers do not fire `contextmenu`). Tap keeps
// the `goPath` jump behavior; a press that moves beyond the long-press
// tolerance is a strip scroll, not a menu trigger.
function MobileStripMoveButton({
  san,
  path,
  active,
  buttonRef,
  onOpenMenu,
}: {
  san: string;
  path: Path;
  active: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onOpenMenu: (path: Path, point: { x: number; y: number }) => void;
}) {
  const goPath = useStudioStore((state) => state.goPath);
  const pressRef = useRef<ReturnType<typeof createLongPress> | null>(null);

  return (
    <button
      ref={buttonRef}
      type="button"
      data-mobile-move={path.length - 1}
      aria-current={active ? "step" : undefined}
      onClick={() => goPath(path)}
      onTouchStart={(event) => {
        const first = event.touches[0];
        if (!first) {
          return;
        }
        const press = createLongPress();
        pressRef.current = press;
        press.start(touchPoint(first), () =>
          onOpenMenu(path, { x: first.clientX, y: first.clientY }),
        );
      }}
      onTouchMove={(event) => {
        const first = event.touches[0];
        if (!first) {
          return;
        }
        pressRef.current?.move(touchPoint(first));
      }}
      onTouchEnd={() => {
        pressRef.current?.end();
        pressRef.current = null;
      }}
      onTouchCancel={() => {
        pressRef.current?.cancel();
        pressRef.current = null;
      }}
      className={`shrink-0 rounded-[5px] px-2 py-1 text-sm font-medium leading-5 ${
        active
          ? "bg-studio-accent-move text-studio-accent-fg"
          : "text-studio-fg hover:bg-studio-hover-strong"
      }`}
    >
      {san}
    </button>
  );
}

export function MobileMoveStrip() {
  const board = useActiveBoard();
  const locale = useStudioStore((state) => state.settings.locale);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const back = useStudioStore((state) => state.back);
  const forward = useStudioStore((state) => state.forward);
  const goPath = useStudioStore((state) => state.goPath);
  const setupMode = useStudioStore((state) => state.setupMode);
  const setEditor = useStudioStore((state) => state.setNotationEditor);
  const pruneAfter = useStudioStore((state) => state.pruneAfter);
  const promote = useStudioStore((state) => state.promoteVariation);
  const makeMain = useStudioStore((state) => state.makeMainline);
  const removeVariation = useStudioStore((state) => state.deleteVariation);
  const toggleMoveNag = useStudioStore((state) => state.toggleMoveNag);
  const clearMoveNags = useStudioStore((state) => state.clearMoveNags);
  const insertNullMove = useStudioStore((state) => state.insertNullMove);
  const [contextMenu, setContextMenu] = useState<NotationMenuState | null>(null);
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);
  const { moves, currentIndex } = mobileStripModel(board.tree, board.path);
  const canForward = continuationsAt(board.tree, board.path).length > 0;
  const activePathKey = currentIndex >= 0 ? (moves[currentIndex]?.path.join("-") ?? "") : "";

  useEffect(() => {
    const el = activeButtonRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }, [activePathKey]);

  const menuNode = contextMenu ? getNodeAt(board.tree, contextMenu.path) : undefined;
  const menuMoveColor: "w" | "b" = contextMenu
    ? plyColor(board.tree.startFen, contextMenu.path.length)
    : "w";
  const menuNags = menuNode?.nags ?? [];
  const menuHasMoveNag = menuNags.some((nag) => nag >= 1 && nag <= 6);
  const menuEnabled = notationMenuEnablement({
    pathLength: contextMenu?.path.length ?? 0,
    canPromote: contextMenu ? canPromote(contextMenu.path) : false,
    canMakeMainline: contextMenu ? canMakeMainline(contextMenu.path) : false,
    setupMode,
    hasNags: menuNags.length > 0,
    hasMoveNag: menuHasMoveNag,
    locale,
  });

  return (
    <div
      data-mobile-move-strip=""
      className="flex min-h-0 items-center gap-1 border-t border-studio-border-subtle bg-studio-panel px-2 py-1.5"
    >
      <button
        type="button"
        aria-label={tStudioChrome(locale, "chrome.moves.previous")}
        onClick={back}
        disabled={board.path.length === 0}
        className="shrink-0 rounded-md p-1.5 text-studio-fg hover:bg-studio-hover-strong disabled:opacity-40"
      >
        <ChevronLeft size={18} />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5">
        {moves.map((move, index) => {
          const active = index === currentIndex;
          const color = plyColor(board.tree.startFen, move.path.length);
          return (
            <MobileStripMoveButton
              key={move.path.join("-")}
              san={formatSan(move.san, moveNotation, color)}
              path={move.path}
              active={active}
              buttonRef={active ? activeButtonRef : undefined}
              onOpenMenu={(path, point) => {
                if (path.length === 0) {
                  return;
                }
                goPath(path);
                setContextMenu({ x: point.x, y: point.y, path });
              }}
            />
          );
        })}
      </div>
      <button
        type="button"
        aria-label={tStudioChrome(locale, "chrome.moves.next")}
        onClick={forward}
        disabled={!canForward}
        className="shrink-0 rounded-md p-1.5 text-studio-fg hover:bg-studio-hover-strong disabled:opacity-40"
      >
        <ChevronRight size={18} />
      </button>
      {contextMenu && menuNode ? (
        <NotationContextMenu
          menu={contextMenu}
          moveColor={menuMoveColor}
          nags={menuNags}
          enabled={menuEnabled}
          locale={locale}
          onTextAfter={() => setEditor("comment")}
          onTextBefore={() => setEditor("commentBefore")}
          onPromote={promote}
          onMakeMainline={makeMain}
          onDeleteVariation={removeVariation}
          onCutAfter={pruneAfter}
          onInsertNull={() => {
            insertNullMove();
          }}
          onToggleNag={(nag) => toggleMoveNag(nag, contextMenu.path)}
          onClearMoveEval={() => {
            for (const nag of menuNags) {
              if (nag >= 1 && nag <= 6) {
                toggleMoveNag(nag, contextMenu.path);
              }
            }
          }}
          onClearAll={() => clearMoveNags(contextMenu.path)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
