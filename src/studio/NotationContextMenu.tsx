"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  ChevronsUp,
  MessageSquare,
  Scissors,
  Tag,
  Trash2,
} from "lucide-react";
import { nagGlyph } from "@/src/chess/nags";
import type { Path } from "@/src/chess/tree";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { MenuDivider, MenuItem, MenuSurface } from "./ui/Menu";
import { useMenuKeyDown } from "./ui/use-menu-keyboard";

export type NotationMenuState = {
  x: number;
  y: number;
  path: Path;
};

export type MenuEnablementItem = {
  disabled: boolean;
  reason?: string;
};

export type NotationMenuEnablement = {
  textAfter: MenuEnablementItem;
  textBefore: MenuEnablementItem;
  promote: MenuEnablementItem;
  makeMainline: MenuEnablementItem;
  deleteVariation: MenuEnablementItem;
  cutAfter: MenuEnablementItem;
  insertNull: MenuEnablementItem;
  clearEval: MenuEnablementItem;
  clearAll: MenuEnablementItem;
};

const MOVE_EVAL_NAGS = new Set([1, 2, 3, 4, 5, 6]);

/**
 * Pure gating helper for the notation context menu (SIG-957).
 * Mirrors MenuBarEditMenu / NotationToolbar disabled states.
 */
export function notationMenuEnablement({
  pathLength,
  canPromote,
  canMakeMainline,
  setupMode,
  hasNags,
  hasMoveNag,
  locale = "en",
}: {
  pathLength: number;
  canPromote: boolean;
  canMakeMainline: boolean;
  setupMode: boolean;
  hasNags: boolean;
  hasMoveNag?: boolean;
  locale?: SiteLocale;
}): NotationMenuEnablement {
  const atStart = pathLength === 0;
  const hasMoveEval = hasMoveNag ?? hasNags;
  return {
    textAfter: { disabled: false },
    textBefore: atStart
      ? { disabled: true, reason: tPanels(locale, "notation.menu.atStart") }
      : { disabled: false },
    promote: canPromote
      ? { disabled: false }
      : { disabled: true, reason: atStart ? tPanels(locale, "notation.menu.atStart") : tPanels(locale, "notation.menu.mainline") },
    makeMainline: canMakeMainline
      ? { disabled: false }
      : { disabled: true, reason: atStart ? tPanels(locale, "notation.menu.atStart") : tPanels(locale, "notation.menu.mainline") },
    // Mirror the Edit menu: delete variation / cut after are always
    // enabled on a move (no disabled state today).
    deleteVariation: { disabled: false },
    cutAfter: { disabled: false },
    insertNull: setupMode
      ? { disabled: true, reason: tPanels(locale, "notation.menu.inSetupMode") }
      : { disabled: false },
    clearEval: hasMoveEval ? { disabled: false } : { disabled: true },
    clearAll: hasNags ? { disabled: false } : { disabled: true },
  };
}

export function resolveSideNag(
  moveColor: "w" | "b",
  whiteNag: number,
  blackNag: number,
): number {
  return moveColor === "w" ? whiteNag : blackNag;
}

/** White/Black pairs collapsed to one menu row, side chosen from the move. */
const SIDE_PAIRS: {
  key: string;
  whiteNag: number;
  blackNag: number;
  label: string;
}[] = [
  { key: "initiative", whiteNag: 36, blackNag: 37, label: "Initiative" },
  { key: "attack", whiteNag: 40, blackNag: 41, label: "Attack" },
  { key: "compensation", whiteNag: 44, blackNag: 45, label: "With compensation" },
  { key: "counterplay-slight", whiteNag: 130, blackNag: 131, label: "Slight counterplay" },
  { key: "counterplay-moderate", whiteNag: 132, blackNag: 133, label: "Moderate counterplay" },
  { key: "counterplay-decisive", whiteNag: 134, blackNag: 135, label: "Decisive counterplay" },
  { key: "time-moderate", whiteNag: 136, blackNag: 137, label: "Moderate time trouble" },
  { key: "time-severe", whiteNag: 138, blackNag: 139, label: "Severe time trouble" },
];

const PAIR_COUNTERPART = new Map<number, number>();
for (const pair of SIDE_PAIRS) {
  PAIR_COUNTERPART.set(pair.whiteNag, pair.blackNag);
  PAIR_COUNTERPART.set(pair.blackNag, pair.whiteNag);
}

export type AnnotationRow = {
  key: string;
  nag: number;
  glyph: string;
  /** SIG-1075: NAG/fixed-pair labels stay English — universal chess
   * annotation vocabulary, same class as brand names. Only the menu chrome
   * around them (section headers, items, reasons) is translated. */
  label: string;
  group: "move" | "position" | "other";
};

/**
 * Annotation submenu rows for a move color. White/Black pairs resolve to a
 * single row via `moveColor`; position pairs (14/15 …) stay as separate
 * evaluation rows.
 */
export function annotationRows(moveColor: "w" | "b"): AnnotationRow[] {
  const rows: AnnotationRow[] = [];
  const push = (nag: number, fallbackLabel: string, group: AnnotationRow["group"]) => {
    const entry = nagGlyph(nag);
    rows.push({
      key: `nag-${nag}`,
      nag,
      glyph: entry?.glyph ?? `$${nag}`,
      label: entry?.label ?? fallbackLabel,
      group,
    });
  };
  // Move group (1–6, mutually exclusive in toggleNag).
  for (const nag of [3, 1, 5, 6, 2, 4]) {
    push(nag, "", "move");
  }
  // Position group (10, 13–19, mutually exclusive).
  for (const nag of [10, 13, 14, 15, 16, 17, 18, 19]) {
    push(nag, "", "position");
  }
  // Other singles.
  push(7, "Only move", "other");
  push(22, "Zugzwang", "other");
  push(32, "Development", "other");
  // Side-aware pairs: one row, NAG chosen from the move color.
  for (const pair of SIDE_PAIRS) {
    const nag = resolveSideNag(moveColor, pair.whiteNag, pair.blackNag);
    const entry = nagGlyph(nag);
    rows.push({
      key: `pair-${pair.key}`,
      nag,
      glyph: entry?.glyph ?? "",
      label: pair.label,
      group: "other",
    });
  }
  push(140, "With the idea", "other");
  push(146, "Novelty", "other");
  return rows;
}

export function counterpartNag(nag: number): number | undefined {
  return PAIR_COUNTERPART.get(nag);
}

export function isMoveEvalNag(nag: number): boolean {
  return MOVE_EVAL_NAGS.has(nag);
}

function Submenu({
  open,
  label,
  flipLeft,
  onOpen,
  onClose,
  children,
}: {
  open: boolean;
  label: React.ReactNode;
  flipLeft: boolean;
  onOpen: () => void;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <MenuItem
        label={label}
        submenu
        highlighted={open}
        leading={<Tag size={14} />}
        onMouseEnter={onOpen}
        onClick={onOpen}
      />
      {open ? (
        <MenuSurface
          className={`absolute top-[-5px] max-h-80 min-w-52 overflow-auto ${
            flipLeft ? "right-full mr-1.5" : "left-full ml-1.5"
          }`}
          onClose={onClose}
        >
          {children}
        </MenuSurface>
      ) : null}
    </div>
  );
}

export function NotationContextMenu({
  menu,
  moveColor,
  nags,
  enabled,
  locale = "en",
  onTextAfter,
  onTextBefore,
  onPromote,
  onMakeMainline,
  onDeleteVariation,
  onCutAfter,
  onInsertNull,
  onToggleNag,
  onClearMoveEval,
  onClearAll,
  onClose,
}: {
  menu: NotationMenuState;
  moveColor: "w" | "b";
  nags: number[];
  enabled: NotationMenuEnablement;
  locale?: SiteLocale;
  onTextAfter: () => void;
  onTextBefore: () => void;
  onPromote: () => void;
  onMakeMainline: () => void;
  onDeleteVariation: () => void;
  onCutAfter: () => void;
  onInsertNull: () => void;
  onToggleNag: (nag: number) => void;
  onClearMoveEval: () => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const handleKeyDown = useMenuKeyDown(rootRef, onClose);
  const [annotationOpen, setAnnotationOpen] = useState(false);

  // Flip the annotation submenu left when there is no room on the right.
  // Computed during render (SSR-safe: window exists — client component opened
  // from a click) so no setState-in-effect cascade.
  const flipLeft =
    typeof window === "undefined" ? false : window.innerWidth - menu.x < 560;

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function onScrollCapture() {
      onClose();
    }
    function onBlur() {
      onClose();
    }
    window.addEventListener("mousedown", onPointer);
    // Capture catches notation-list scroll as well as any other scroll.
    window.addEventListener("scroll", onScrollCapture, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onScrollCapture, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [onClose]);

  const closeAfter = (action: () => void) => () => {
    // Close first so a stale path is never reused after Delete.
    onClose();
    action();
  };

  const handleTogglePairAware = (nag: number) => {
    const counterpart = counterpartNag(nag);
    if (counterpart !== undefined && nags.includes(counterpart) && !nags.includes(nag)) {
      // Replace a wrong-side NAG from old white-only saves instead of
      // stacking both sides.
      onClose();
      onToggleNag(counterpart);
      onToggleNag(nag);
      return;
    }
    onClose();
    onToggleNag(nag);
  };

  const rows = annotationRows(moveColor);
  const moveRows = rows.filter((row) => row.group === "move");
  const positionRows = rows.filter((row) => row.group === "position");
  const otherRows = rows.filter((row) => row.group === "other");
  const hasMoveEval = nags.some((nag) => isMoveEvalNag(nag));
  const noneChecked = !hasMoveEval;

  const onRootKeyDown = (event: React.KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null;
    const inSubmenu =
      active && rootRef.current
        ? Boolean(
            active.closest('[data-annotation-submenu="true"]') &&
              rootRef.current.contains(active),
          )
        : false;
    if (event.key === "ArrowRight") {
      if (!annotationOpen && active?.getAttribute("aria-haspopup") === "true") {
        event.preventDefault();
        event.stopPropagation();
        triggerRef.current = active;
        setAnnotationOpen(true);
        requestAnimationFrame(() => {
          const first = rootRef.current?.querySelector<HTMLElement>(
            '[data-annotation-submenu="true"] [role="menuitemcheckbox"], [data-annotation-submenu="true"] [role="menuitem"]',
          );
          first?.focus();
        });
        return;
      }
    }
    if (event.key === "ArrowLeft" && annotationOpen && inSubmenu) {
      event.preventDefault();
      event.stopPropagation();
      setAnnotationOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "Escape" && annotationOpen) {
      // Close the submenu first (En Croissant behavior); a second Esc
      // bubbles to useMenuKeyDown and closes the whole menu.
      event.stopPropagation();
      setAnnotationOpen(false);
      triggerRef.current?.focus();
      return;
    }
    handleKeyDown(event);
  };

  // Main panel width ~256px; clamp like BoardContextMenu.
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 280));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - 380));

  return (
    <div ref={rootRef} className="fixed z-[1100]" style={{ left, top }} onKeyDown={onRootKeyDown}>
      <MenuSurface className="min-w-60" onClose={onClose}>
        <div role="menu" aria-label={tPanels(locale, "notation.menu.moveActions")}>
          <MenuItem
            label={tPanels(locale, "notation.menu.textAfter")}
            shortcut="Ctrl+A"
            leading={<MessageSquare size={14} />}
            disabled={enabled.textAfter.disabled}
            disabledReason={enabled.textAfter.reason}
            onMouseEnter={() => setAnnotationOpen(false)}
            onClick={closeAfter(onTextAfter)}
          />
          <MenuItem
            label={tPanels(locale, "notation.menu.textBefore")}
            shortcut="Ctrl+Shift+A"
            leading={<MessageSquare size={14} />}
            disabled={enabled.textBefore.disabled}
            disabledReason={enabled.textBefore.reason}
            onMouseEnter={() => setAnnotationOpen(false)}
            onClick={closeAfter(onTextBefore)}
          />
          <Submenu
            open={annotationOpen}
            label={tPanels(locale, "notation.menu.annotation")}
            flipLeft={flipLeft}
            onOpen={() => setAnnotationOpen(true)}
            onClose={() => setAnnotationOpen(false)}
          >
            <div data-annotation-submenu="true">
              <MenuItem
                label={tPanels(locale, "notation.menu.none")}
                disabled={enabled.clearEval.disabled}
                onClick={closeAfter(onClearMoveEval)}
              />
              <MenuDivider />
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-studio-faint">
                {tPanels(locale, "notation.menu.sectionMove")}
              </div>
              {moveRows.map((row) => (
                <MenuItem
                  key={row.key}
                  label={`${row.glyph} ${row.label}`}
                  checked={nags.includes(row.nag)}
                  onClick={() => handleTogglePairAware(row.nag)}
                />
              ))}
              <MenuDivider />
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-studio-faint">
                {tPanels(locale, "notation.menu.sectionPosition")}
              </div>
              {positionRows.map((row) => (
                <MenuItem
                  key={row.key}
                  label={`${row.glyph} ${row.label}`}
                  checked={nags.includes(row.nag)}
                  onClick={() => handleTogglePairAware(row.nag)}
                />
              ))}
              <MenuDivider />
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-studio-faint">
                {tPanels(locale, "notation.menu.sectionInformant")}
              </div>
              {otherRows.map((row) => (
                <MenuItem
                  key={row.key}
                  label={`${row.glyph} ${row.label}`}
                  checked={
                    nags.includes(row.nag) ||
                    (counterpartNag(row.nag) !== undefined &&
                      nags.includes(counterpartNag(row.nag) as number))
                  }
                  onClick={() => handleTogglePairAware(row.nag)}
                />
              ))}
              <MenuDivider />
              <MenuItem
                label={tPanels(locale, "notation.menu.clearAll")}
                disabled={enabled.clearAll.disabled}
                onClick={closeAfter(onClearAll)}
              />
              {/* Expose None-checked state for tests without visual noise. */}
              <span data-testid="none-checked" hidden>
                {noneChecked ? "true" : "false"}
              </span>
            </div>
          </Submenu>
          <MenuDivider />
          <MenuItem
            label={tPanels(locale, "notation.menu.promote")}
            shortcut="Ctrl+↑"
            leading={<ArrowUp size={14} />}
            disabled={enabled.promote.disabled}
            disabledReason={enabled.promote.reason}
            onMouseEnter={() => setAnnotationOpen(false)}
            onClick={closeAfter(onPromote)}
          />
          <MenuItem
            label={tPanels(locale, "notation.menu.makeMainline")}
            shortcut="Ctrl+Shift+↑"
            leading={<ChevronsUp size={14} />}
            disabled={enabled.makeMainline.disabled}
            disabledReason={enabled.makeMainline.reason}
            onMouseEnter={() => setAnnotationOpen(false)}
            onClick={closeAfter(onMakeMainline)}
          />
          <MenuItem
            label={tPanels(locale, "notation.menu.deleteVariation")}
            shortcut="Ctrl+Del"
            leading={<Trash2 size={14} />}
            disabled={enabled.deleteVariation.disabled}
            disabledReason={enabled.deleteVariation.reason}
            onMouseEnter={() => setAnnotationOpen(false)}
            onClick={closeAfter(onDeleteVariation)}
          />
          <MenuItem
            label={tPanels(locale, "notation.menu.cutAfter")}
            shortcut="Del"
            leading={<Scissors size={14} />}
            disabled={enabled.cutAfter.disabled}
            disabledReason={enabled.cutAfter.reason}
            onMouseEnter={() => setAnnotationOpen(false)}
            onClick={closeAfter(onCutAfter)}
          />
          <MenuDivider />
          <MenuItem
            label={tPanels(locale, "notation.menu.insertNull")}
            leading={<ArrowRight size={14} />}
            disabled={enabled.insertNull.disabled}
            disabledReason={enabled.insertNull.reason}
            onMouseEnter={() => setAnnotationOpen(false)}
            onClick={closeAfter(onInsertNull)}
          />
        </div>
      </MenuSurface>
    </div>
  );
}
