"use client";

// SIG-1109: pure touch-gesture logic for the mobile studio (swipe navigation,
// long-press context menus). Kept DOM-free and React-free so node:test can
// exercise the thresholds without a renderer (same pattern as
// `watchMobileMedia` in use-is-mobile.ts: the components below stay thin
// wrappers over these helpers).

export type TouchPoint = {
  x: number;
  y: number;
};

export type SwipeOptions = {
  minDistance?: number;
  maxVertical?: number;
};

const DEFAULT_SWIPE_MIN_DISTANCE = 40;
const DEFAULT_SWIPE_MAX_VERTICAL = 30;

/**
 * Horizontal-dominant swipe classifier. `dx >= minDistance` (finger moved
 * left) means forward one move; `dx <= -minDistance` (finger moved right)
 * means back. Anything shorter or with too much vertical drift is `null`.
 */
export function swipeDirection(
  start: TouchPoint,
  end: TouchPoint,
  options: SwipeOptions = {},
): "left" | "right" | null {
  const { minDistance = DEFAULT_SWIPE_MIN_DISTANCE, maxVertical = DEFAULT_SWIPE_MAX_VERTICAL } = options;
  const dx = start.x - end.x;
  const dy = Math.abs(start.y - end.y);
  if (dy > maxVertical) {
    return null;
  }
  if (dx >= minDistance) {
    return "left";
  }
  if (dx <= -minDistance) {
    return "right";
  }
  return null;
}

export type LongPressOptions = {
  delayMs?: number;
  moveTolerance?: number;
};

const DEFAULT_LONG_PRESS_DELAY_MS = 500;
const DEFAULT_LONG_PRESS_TOLERANCE = 10;

export type LongPressController = {
  start: (point: TouchPoint, onFire: () => void) => void;
  move: (point: TouchPoint) => void;
  end: () => void;
  cancel: () => void;
};

/**
 * Timer-based long-press detector. Fires `onFire` once when the touch holds
 * still past `delayMs`; any move beyond `moveTolerance`, or `end()`/`cancel()`
 * before the delay, suppresses the fire. A swipe that exceeds the tolerance
 * cancels the pending long-press through `move()` — callers wire both from
 * the same touch stream so the two gestures never double-trigger.
 */
export function createLongPress(options: LongPressOptions = {}): LongPressController {
  const { delayMs = DEFAULT_LONG_PRESS_DELAY_MS, moveTolerance = DEFAULT_LONG_PRESS_TOLERANCE } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let origin: TouchPoint | null = null;
  let callback: (() => void) | null = null;

  function clear() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    origin = null;
    callback = null;
  }

  return {
    start(point: TouchPoint, onFire: () => void) {
      clear();
      origin = point;
      callback = onFire;
      timer = setTimeout(() => {
        const fire = callback;
        clear();
        fire?.();
      }, delayMs);
    },
    move(point: TouchPoint) {
      if (!origin || !timer) {
        return;
      }
      const moved = Math.hypot(point.x - origin.x, point.y - origin.y);
      if (moved > moveTolerance) {
        clear();
      }
    },
    end() {
      clear();
    },
    cancel() {
      clear();
    },
  };
}

export function touchPoint(touch: { clientX: number; clientY: number }): TouchPoint {
  return { x: touch.clientX, y: touch.clientY };
}
