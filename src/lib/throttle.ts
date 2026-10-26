// Throttle helper for high-frequency engine snapshots (SIG-1080).
//
// Leading call executes immediately and opens a window; calls inside the
// window keep only the latest args, delivered once when the window elapses.
// The window re-arms while calls keep arriving, so the last snapshot is
// always shown. Pure timer state (no Date.now) so node:test mock.timers and
// browser timers behave identically. Dependency-free so panel code and
// node:test can share it.

export type Throttled<A extends unknown[]> = {
  (...args: A): void;
  cancel: () => void;
  flush: () => void;
};

export function throttleLatest<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): Throttled<A> {
  let lastArgs: A | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function onWindow(): void {
    if (lastArgs !== null) {
      const args = lastArgs;
      lastArgs = null;
      fn(...args);
      timer = setTimeout(onWindow, ms);
    } else {
      timer = null;
    }
  }

  function throttled(...args: A): void {
    if (timer === null) {
      fn(...args);
      timer = setTimeout(onWindow, ms);
      return;
    }
    lastArgs = args;
  }

  throttled.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  throttled.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (lastArgs !== null) {
      const args = lastArgs;
      lastArgs = null;
      fn(...args);
    }
  };

  return throttled;
}
