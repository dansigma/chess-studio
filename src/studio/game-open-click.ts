// SIG-910: single-click (preview) vs double-click (new board) discrimination.
//
// The browser fires `click` twice before `dblclick`, so a row cannot wire
// onClick + onDoubleClick directly — the preview load would race the
// new-board open. This factory defers the single-click action by `delay` ms
// and cancels it when the double-click arrives. Framework-free so it is
// unit-testable in isolation; panels own the React wiring.
export type GameOpenClickTimer = {
  set: (callback: () => void, delay: number) => unknown;
  clear: (handle: unknown) => void;
};

const defaultTimer: GameOpenClickTimer = {
  set: (callback, delay) => window.setTimeout(callback, delay),
  clear: (handle) => window.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createSingleDoubleClick(options: {
  delay?: number;
  onSingle: () => void;
  onDouble: () => void;
  timer?: GameOpenClickTimer;
}): {
  handleClick: () => void;
  handleDoubleClick: () => void;
  cancel: () => void;
  dispose: () => void;
} {
  const delay = options.delay ?? 250;
  const timer = options.timer ?? defaultTimer;
  let pending: unknown | null = null;

  function cancel(): void {
    if (pending !== null) {
      timer.clear(pending);
      pending = null;
    }
  }

  // First click schedules the single action; a second click arriving while
  // one is pending is the browser's pre-dblclick echo — ignore it and wait
  // for handleDoubleClick to cancel + fire the double action.
  function handleClick(): void {
    if (pending !== null) {
      return;
    }
    pending = timer.set(() => {
      pending = null;
      options.onSingle();
    }, delay);
  }

  function handleDoubleClick(): void {
    cancel();
    options.onDouble();
  }

  return { handleClick, handleDoubleClick, cancel, dispose: cancel };
}
