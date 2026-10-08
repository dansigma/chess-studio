"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

export const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

export type MenuMove = "up" | "down" | "first" | "last";

export function nextMenuIndex(current: number, total: number, move: MenuMove): number {
  if (total <= 0) {
    return 0;
  }
  switch (move) {
    case "up":
      return (current - 1 + total) % total;
    case "down":
      return (current + 1) % total;
    case "first":
      return 0;
    case "last":
      return total - 1;
  }
}

function menuItemsIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(
    (node) =>
      !(node instanceof HTMLButtonElement && node.disabled) &&
      node.getAttribute("aria-disabled") !== "true",
  );
}

export function focusMenuItem(root: HTMLElement | null, index: number): void {
  if (!root) {
    return;
  }
  menuItemsIn(root)[index]?.focus();
}

/**
 * Roving keyboard navigation for `role="menu"` surfaces (SIG-863).
 * ArrowDown/Up/Home/End move focus across menuitem descendants,
 * Escape invokes `onClose`. Returns an `onKeyDown` handler to spread
 * onto the menu root, and auto-focuses the first item on mount.
 */
export function useMenuKeyDown(
  rootRef: RefObject<HTMLElement | null>,
  onClose?: () => void,
  active = true,
): (event: React.KeyboardEvent) => void {
  const previousRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) {
      return;
    }
    previousRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Defer so the menu is laid out before stealing focus.
    const timer = window.setTimeout(() => {
      const root = rootRef.current;
      if (root && !root.contains(document.activeElement)) {
        focusMenuItem(root, 0);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, rootRef]);

  const close = useCallback(() => {
    onClose?.();
    // Return focus to the trigger on Escape, unless it lives inside the
    // menu being closed (e.g. a nested submenu item).
    const root = rootRef.current;
    const previous = previousRef.current;
    if (previous && (!root || !root.contains(previous))) {
      previous.focus({ preventScroll: true });
    }
  }, [onClose, rootRef]);

  return useCallback(
    (event: React.KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      const items = menuItemsIn(root);
      if (items.length === 0) {
        return;
      }
      const current = items.indexOf(document.activeElement as HTMLElement);
      let move: MenuMove | null = null;
      if (event.key === "ArrowDown") {
        move = "down";
      } else if (event.key === "ArrowUp") {
        move = "up";
      } else if (event.key === "Home") {
        move = "first";
      } else if (event.key === "End") {
        move = "last";
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      focusMenuItem(root, nextMenuIndex(current < 0 ? -1 : current, items.length, move));
    },
    [close, rootRef],
  );
}
