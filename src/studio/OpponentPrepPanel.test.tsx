// SIG-1347: a saved layout that still contains the retired Opponent prep panel
// must load without error and point the user to the Library player dossier.
import { after, beforeEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OpponentPrepPanel } from "./OpponentPrepPanel";
import { useLibraryStore } from "./library/library-store";
import { useStudioStore } from "@/src/store/studio-store";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings.ts";

before(() => {
  setupDom();
});

after(() => {
  teardownDom();
});

beforeEach(() => {
  useStudioStore.setState({
    workspaceView: "studio",
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
  });
  useLibraryStore.setState({ mode: "games" });
});

test("shows the redirect message and a button to the Library dossier (en)", () => {
  render(<OpponentPrepPanel />);

  assert.match(screen.getByText(/moved into the Library/).textContent ?? "", /player dossier/);

  fireEvent.click(screen.getByRole("button", { name: "Open dossier in Library" }));

  assert.equal(useLibraryStore.getState().mode, "players");
  assert.equal(useStudioStore.getState().workspaceView, "library");

  cleanup();
});

test("uses the pt-BR redirect button label from a saved layout", () => {
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } });

  render(<OpponentPrepPanel />);

  assert.ok(screen.getByRole("button", { name: "Abrir dossiê na Biblioteca" }));
  assert.match(screen.getByText(/A Preparação contra agora fica na Biblioteca/).textContent ?? "", /dossiê/);

  cleanup();
});
