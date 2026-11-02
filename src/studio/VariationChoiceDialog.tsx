"use client";

import { useEffect, useRef } from "react";
import {
  continuationsAt,
  moveNumberForPath,
  pathsEqual,
  plyColor,
} from "@/src/chess/tree";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

// SIG-1187: modal continuation chooser for single-step Forward at a branching
// position. Rendered from StudioShell (desktop + mobile); reads the store
// directly so no prop plumbing is needed. Returns null for stale choices
// (wrong board, moved path, fewer than 2 children) — the store-side
// validation in chooseVariation is the backstop.
export function VariationChoiceDialog() {
  const locale = useStudioStore((state) => state.settings.locale);
  const choice = useStudioStore((state) => state.variationChoice);
  const chooseVariation = useStudioStore((state) => state.chooseVariation);
  const cancel = useStudioStore((state) => state.cancelVariationChoice);
  const listRef = useRef<HTMLDivElement>(null);
  // SIG-1187: roving-focus cursor for the option list. useDialogFocus moves
  // keyboard focus to the dialog's first descendant (the close button) on
  // mount and happy-dom's focus() is layout-blind, so DOM activeElement cannot
  // be trusted as the arrow cursor — track the index in a ref instead and
  // focus the matching button explicitly. Tab order is unchanged (all options
  // stay natively tabbable); this only drives ArrowUp/Down/Home/End/Enter.
  // QA (SIG-1187 rework): Tab moves DOM focus without touching the arrows, so
  // each option also syncs the cursor on focus — otherwise Tab-to-c5 + Enter
  // would select the stale arrow cursor (e5) instead of the focused button.
  const cursorRef = useRef(0);

  const board = useStudioStore((state) =>
    choice ? state.boards.find((item) => item.id === choice.boardId) : undefined,
  );

  // Focus the first option on open, ahead of paint. Child effects run before
  // the parent Dialog's mount effect, so this wins over useDialogFocus's
  // focus-first-descendant (which would land on the close button).
  useEffect(() => {
    cursorRef.current = 0;
    listRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [choice]);

  if (!choice || !board || !pathsEqual(board.path, choice.path)) {
    return null;
  }
  const continuations = continuationsAt(board.tree, choice.path);
  if (continuations.length < 2) {
    return null;
  }

  const childPly = choice.path.length + 1;

  function focusOption(index: number): void {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>(
      "button[data-option]",
    );
    if (!buttons || buttons.length === 0) {
      return;
    }
    const wrapped = ((index % buttons.length) + buttons.length) % buttons.length;
    cursorRef.current = wrapped;
    buttons[wrapped].focus();
  }

  function onListKeyDown(event: React.KeyboardEvent): void {
    if (event.key >= "1" && event.key <= "9") {
      event.preventDefault();
      chooseVariation(Number(event.key) - 1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(cursorRef.current + (event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusOption(continuations.length - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      chooseVariation(cursorRef.current);
    }
  }

  return (
    <Dialog
      title={tPanels(locale, "notation.variationChooser.title")}
      onClose={cancel}
      hint={tPanels(locale, "notation.variationChooser.hint")}
      footer={
        <Button variant="ghost" onClick={cancel}>
          {tPanels(locale, "dialog.cancel")}
        </Button>
      }
    >
      <p className="mb-3">{tPanels(locale, "notation.variationChooser.body")}</p>
      <div
        ref={listRef}
        data-variation-list=""
        onKeyDown={onListKeyDown}
        className="flex max-h-64 flex-col gap-1 overflow-y-auto"
      >
        {continuations.map((child, index) => {
          const color = plyColor(board.tree.startFen, childPly);
          const number = moveNumberForPath(board.tree.startFen, childPly);
          const label = `${number}${color === "b" ? "..." : "."} ${child.san}`;
          return (
            <button
              key={child.id}
              type="button"
              data-option={index}
              onClick={() => chooseVariation(index)}
              onFocus={() => {
                cursorRef.current = index;
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-body text-studio-fg hover:bg-studio-hover-strong focus-visible:outline focus-visible:outline-studio-accent"
            >
              <span className="font-medium">{label}</span>
              {index === 0 ? (
                <span className="rounded-full bg-studio-hover-strong px-2 py-0.5 text-caption text-studio-muted">
                  {tPanels(locale, "notation.variationChooser.mainline")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
