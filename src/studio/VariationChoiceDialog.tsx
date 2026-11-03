"use client";

import { useEffect, useRef, useState } from "react";
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
  // SIG-1190: single shared active index for the option list. Keyboard
  // (arrows/Home/End/Tab focus), pointer hover, and the shaded background all
  // read and write this state, so exactly one row is shaded at a time — the
  // last interaction wins. useDialogFocus moves keyboard focus to the dialog's
  // first descendant (the close button) on mount and happy-dom's focus() is
  // layout-blind, so DOM activeElement cannot be trusted as the arrow cursor —
  // track the index in state instead and focus the matching button explicitly.
  // Tab order is unchanged (all options stay natively tabbable).
  const [activeIndex, setActiveIndex] = useState(0);

  const board = useStudioStore((state) =>
    choice ? state.boards.find((item) => item.id === choice.boardId) : undefined,
  );

  // Focus the first option on open, ahead of paint. Child effects run before
  // the parent Dialog's mount effect, so this wins over useDialogFocus's
  // focus-first-descendant (which would land on the close button).
  /* eslint-disable react-hooks/set-state-in-effect -- SIG-1190: resetting the
     shared active index synchronously keeps the first option shaded on the
     first paint when a new choice opens. */
  useEffect(() => {
    setActiveIndex(0);
    listRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [choice]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    setActiveIndex(wrapped);
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
      focusOption(activeIndex + (event.key === "ArrowDown" ? 1 : -1));
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
      chooseVariation(activeIndex);
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
              data-active={index === activeIndex ? "true" : undefined}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => chooseVariation(index)}
              onFocus={() => {
                setActiveIndex(index);
              }}
              onMouseEnter={() => {
                setActiveIndex(index);
              }}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-body text-studio-fg transition-colors duration-150 focus:outline-none focus-visible:outline-none${index === activeIndex ? " bg-studio-hover-strong" : ""}`}
            >
              <span className="font-medium">{label}</span>
              {index === 0 ? (
                <span className="rounded-full border border-studio-border bg-studio-panel px-2 py-0.5 text-caption text-studio-muted">
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
