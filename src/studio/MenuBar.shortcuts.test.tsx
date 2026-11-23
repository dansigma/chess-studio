// SIG-1383: Help → "Shortcuts and gestures" opens the reference dialog via the
// shared `shortcutsOpen` store flag (StudioShell renders ShortcutsDialog).
import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

mock.module("next/navigation", {
  namedExports: { useRouter: () => ({ push() {} }), usePathname: () => "/studio" },
});
mock.module("@/app/login/actions", { namedExports: { signOut: async () => {} } });
mock.module("@/src/lib/supabase/client", { namedExports: { createBrowserSupabase: () => null } });

const { MenuBar } = await import("./MenuBar.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

before(() => setupDom());
after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  act(() => {
    useStudioStore.setState({
      shortcutsOpen: false,
      aboutOpen: false,
      settings: { ...DEFAULT_SETTINGS, locale: "pt-br" },
    });
  });
});

test("Help menu offers Shortcuts and gestures above About and opens the dialog flag", () => {
  render(<MenuBar onOpenPgn={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Ajuda" }));

  const shortcutsItem = screen.getByRole("menuitem", { name: "Atalhos e gestos" });
  const aboutItem = screen.getByRole("menuitem", { name: /Sobre / });
  // Shortcuts sits above About in the Help menu.
  assert.ok(
    shortcutsItem.compareDocumentPosition(aboutItem) &
      window.Node.DOCUMENT_POSITION_FOLLOWING,
  );

  fireEvent.click(shortcutsItem);
  assert.equal(useStudioStore.getState().shortcutsOpen, true);
  assert.equal(useStudioStore.getState().aboutOpen, false);
});

test("Edit menu enables Undo and Redo only when the active board can use them", () => {
  const store = () => useStudioStore.getState();
  act(() => store().newBoard());
  render(<MenuBar onOpenPgn={() => {}} />);
  const edit = screen.getByRole("button", { name: "Editar" });
  const undo = () => screen.getByRole<HTMLButtonElement>("menuitem", { name: /^Desfazer/ });
  const redo = () => screen.getByRole<HTMLButtonElement>("menuitem", { name: /^Refazer/ });

  fireEvent.click(edit);
  assert.equal(undo().disabled, true);
  assert.equal(redo().disabled, true);

  act(() => store().setMoveComment("test"));
  assert.equal(undo().disabled, false);
  assert.equal(redo().disabled, true);
  fireEvent.click(undo());
  assert.equal(store().active().tree.startComment, undefined);

  fireEvent.click(edit);
  assert.equal(undo().disabled, true);
  assert.equal(redo().disabled, false);
  fireEvent.click(redo());
  assert.equal(store().active().tree.startComment, "test");
});
