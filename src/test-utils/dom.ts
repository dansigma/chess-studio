// DOM harness for `node --test` component suites (SIG-1045).
//
// Happy-dom provides the browser globals React and Testing Library need;
// React's `act()` environment flag is set so state updates in tests don't warn.
// Each `node --test` file runs in its own process, so per-file setup/teardown
// keeps suites hermetic without a global preload.
//
// IMPORTANT: import this module BEFORE `@testing-library/react` in test files.
// Testing Library binds its `screen` queries to `document.body` at import time,
// so the DOM globals must already exist when that import evaluates. This module
// installs one happy-dom Window at import time; `setupDom()` re-installs the
// same instance (recording shadowed values) for suites that want an explicit
// setup/teardown pair, and accepts an optional `matchMediaMatches` override.
import { Window } from "happy-dom";

const INSTALLED_KEYS = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "MutationObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "localStorage",
  "matchMedia",
  "IS_REACT_ACT_ENVIRONMENT",
] as const;

// Values shadowed by setupDom, restored (or deleted) by teardownDom.
const previous = new Map<string, unknown>();
let installed = false;

function installWindow(happyWindow: Window, matchMediaMatches = false): void {
  const values: Record<string, unknown> = {
    window: happyWindow,
    document: happyWindow.document,
    navigator: happyWindow.navigator,
    HTMLElement: happyWindow.HTMLElement,
    MutationObserver: happyWindow.MutationObserver,
    requestAnimationFrame: happyWindow.requestAnimationFrame.bind(happyWindow),
    cancelAnimationFrame: happyWindow.cancelAnimationFrame.bind(happyWindow),
    localStorage: happyWindow.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  }
  // Happy-dom ships a minimal MediaQueryList; wrap it so tests get a stable
  // listener API they can drive with an optional `matches` override.
  const matchMedia = (query: string) => {
    const list = happyWindow.matchMedia(query);
    return {
      ...list,
      matches: matchMediaMatches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  };
  Object.defineProperty(globalThis, "matchMedia", {
    value: matchMedia,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

const happyWindow = new Window();
installWindow(happyWindow);

export interface SetupDomOptions {
  /** Override for the matchMedia fake's `matches` (default false). */
  matchMediaMatches?: boolean;
}

/**
 * (Re)install the module's happy-dom globals and return the Window.
 * Call in `before()`/`beforeEach`, pair with `teardownDom()` in `after()`.
 *
 * Note: `navigator` is a getter-only global in Node 22, so plain assignment
 * throws — every key is installed with `defineProperty` instead.
 */
export function setupDom(options: SetupDomOptions = {}): Window {
  if (!installed) {
    const globals = globalThis as Record<string, unknown>;
    for (const key of INSTALLED_KEYS) {
      previous.set(key, globals[key]);
    }
    installed = true;
  } else {
    // Re-install on the same instance (fresh listeners/config per call).
    installWindow(happyWindow, options.matchMediaMatches ?? false);
    return happyWindow;
  }
  installWindow(happyWindow, options.matchMediaMatches ?? false);
  return happyWindow;
}

/** Remove everything this module installed, restoring shadowed values. */
export async function teardownDom(): Promise<void> {
  if (installed) {
    for (const key of INSTALLED_KEYS) {
      const prior = previous.get(key);
      if (prior === undefined) {
        delete (globalThis as Record<string, unknown>)[key];
      } else {
        Object.defineProperty(globalThis, key, {
          value: prior,
          configurable: true,
          writable: true,
          enumerable: true,
        });
      }
    }
    previous.clear();
    installed = false;
  }
  await happyWindow.close();
}
