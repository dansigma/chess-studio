export type TrainerKeyAction = "hint" | "continue" | "scrub-back" | "scrub-forward";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const INTERACTIVE_SELECTOR =
  'button, a[href], summary, [role="button"], [role="link"], [role="menuitem"], [role="radio"], [role="tab"]';
const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"], [aria-modal="true"], [data-promotion-open]';

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }
  const el = target as Partial<HTMLElement>;
  if (el.tagName && EDITABLE_TAGS.has(el.tagName)) {
    return true;
  }
  if (el.isContentEditable) {
    return true;
  }
  if (typeof el.closest === "function" && el.closest("[contenteditable]:not([contenteditable='false'])")) {
    return true;
  }
  return false;
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }
  const el = target as Partial<HTMLElement>;
  if (typeof el.closest === "function") {
    return Boolean(el.closest(INTERACTIVE_SELECTOR));
  }
  return false;
}

export function hasOpenDialog(doc: Document | undefined): boolean {
  if (!doc || typeof doc.querySelector !== "function") {
    return false;
  }
  return doc.querySelector(DIALOG_SELECTOR) !== null;
}

export function resolveTrainerKeyAction({
  key,
  ctrlKey,
  metaKey,
  altKey,
  shiftKey,
  defaultPrevented,
  inEditable,
  inInteractive,
  dialogOpen,
  userTurn,
  canContinue,
  canScrub,
}: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  inEditable: boolean;
  inInteractive: boolean;
  dialogOpen: boolean;
  userTurn: boolean;
  canContinue: boolean;
  canScrub: boolean;
}): TrainerKeyAction | null {
  if (defaultPrevented || ctrlKey || metaKey || altKey || inEditable || dialogOpen) {
    return null;
  }
  if (key.toLowerCase() === "h") {
    return userTurn ? "hint" : null;
  }
  if (shiftKey) {
    return null;
  }
  if (key === "Enter" || key === " ") {
    return !inInteractive && canContinue ? "continue" : null;
  }
  if (key === "ArrowLeft") {
    return canScrub ? "scrub-back" : null;
  }
  if (key === "ArrowRight") {
    return canScrub ? "scrub-forward" : null;
  }
  return null;
}
