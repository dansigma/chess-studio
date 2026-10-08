"use client";

import { useEffect, type RefObject } from "react";

export const DIALOG_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function nextFocusIndex(current: number, total: number, shift: boolean): number {
  if (total <= 0) {
    return 0;
  }
  if (shift) {
    return (current - 1 + total) % total;
  }
  return (current + 1) % total;
}

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)).filter(
    (node) => node.offsetParent !== null || node === document.activeElement,
  );
}

/**
 * Focus management for modal dialogs (SIG-863).
 * Stores the previously focused element, moves focus inside on mount,
 * traps Tab / Shift+Tab, and restores focus on unmount.
 */
export function useDialogFocus(rootRef: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    const root = rootRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Tab" || !rootRef.current) {
        return;
      }
      const items = focusablesIn(rootRef.current);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !rootRef.current.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Focus the first focusable descendant, falling back to the root itself.
    const items = root ? focusablesIn(root) : [];
    if (items.length > 0) {
      items[0].focus();
    } else if (root) {
      if (!root.hasAttribute("tabindex")) {
        root.setAttribute("tabindex", "-1");
      }
      root.focus();
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [active, rootRef]);
}
