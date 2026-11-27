import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, render, screen } from "@testing-library/react";
import { StatusBar } from "./StatusBar.tsx";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings.ts";
import { useStudioStore } from "@/src/store/studio-store.ts";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings.ts";

before(() => setupDom());
afterEach(() => cleanup());
after(() => teardownDom());

test("StatusBar condenses telemetry and keeps room for status messages", () => {
  act(() => {
    useStudioStore.setState({
      user: null,
      settings: { ...DEFAULT_SETTINGS, locale: "en", engineThreads: 4 },
    });
  });

  render(<StatusBar message="Loaded game 1 of 12 from repertoire.pgn" />);

  const status = screen.getByRole("status");
  assert.equal(status.textContent, "Loaded game 1 of 12 from repertoire.pgn");
  assert.ok(status.className.includes("min-w-0"));
  assert.ok(status.className.includes("flex-1"));
  assert.ok(status.className.includes("break-words"));

  // Compact sync label stays visible while desktop thread/source verbosity is omitted.
  assert.ok(screen.getByText(tStudioChrome("en", "chrome.statusBar.guest")));
  assert.equal(screen.queryByText(/threads/i), null);
  assert.equal(screen.queryByText(/Lichess/i), null);
});
