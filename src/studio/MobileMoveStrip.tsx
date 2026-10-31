"use client";

import { useRef, useState } from "react";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { canMakeMainline, canPromote, getNodeAt, plyColor, type GameTree, type Path } from "@/src/chess/tree";
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
  // Walk the mainline (first-child spine), recording each ply's path.
  while (nodes[0]) {
    const node = nodes[0];
    cursor = [...cursor, 0];
    moves.push({ san: node.san, path: cursor });
    nodes = node.children;
  }
  // The live path may diverge into a variation — clamp to the longest
  // mainline prefix so the highlight never points past the strip.
  let currentIndex = -1;
  for (let i = 0; i < moves.length; i++) {
    if (i >= path.length || path[i] !== 0) {
      break;
    }
    currentIndex = i;
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
  onOpenMenu,
}: {
  san: string;
  path: Path;
  active: boolean;
  onOpenMenu: (path: Path, point: { x: number; y: number }) => void;
}) {
  const goPath = useStudioStore((state) => state.goPath);
  const pressRef = useRef<ReturnType<typeof createLongPress> | null>(null);

  return (
    <button
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
  const { moves, currentIndex } = mobileStripModel(board.tree, board.path);

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
        aria-label="Previous move"
        onClick={back}
        disabled={board.path.length === 0}
        className="shrink-0 rounded-md p-1.5 text-studio-fg hover:bg-studio-hover-strong disabled:opacity-40"
      >
        <ChevronLeft size={18} />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5">
        {moves.map((move, index) => {
          const active = index === currentIndex;
          return (
            <MobileStripMoveButton
              key={move.path.join("-")}
              san={move.san}
              path={move.path}
              active={active}
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
        aria-label="Next move"
        onClick={forward}
        disabled={currentIndex >= moves.length - 1}
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
