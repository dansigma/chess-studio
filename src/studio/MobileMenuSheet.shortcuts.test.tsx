// SIG-1383: the mobile hamburger sheet exposes the same "Shortcuts and
// gestures" entry as the desktop Help menu; tapping it sets the shared
// `shortcutsOpen` flag that StudioShell turns into the ShortcutsDialog.
import assert from "node:assert/strict";
import { useState } from "react";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

mock.module("next/navigation", {
  namedExports: { useRouter: () => ({ push() {} }), usePathname: () => "/studio" },
});

const { MobileMenuSheet } = await import("./MobileMenuSheet.tsx");
const { ShortcutsDialog } = await import("./ShortcutsDialog.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

function Harness({ onClose }: { onClose: () => void }) {
  const [sheetOpen, setSheetOpen] = useState(true);
  const shortcutsOpen = useStudioStore((state) => state.shortcutsOpen);
  return (
    <>
      {sheetOpen ? (
        <MobileMenuSheet
          onOpenPgn={() => {}}
          onShare={() => {}}
          onOpenSettings={() => {}}
          onClose={() => {
            onClose();
            setSheetOpen(false);
          }}
        />
      ) : null}
      {shortcutsOpen ? (
        <ShortcutsDialog onClose={() => useStudioStore.getState().setShortcutsOpen(false)} />
      ) : null}
    </>
  );
}

before(() => setupDom());
after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  act(() => {
    useStudioStore.setState({
      shortcutsOpen: false,
      settings: { ...DEFAULT_SETTINGS, locale: "pt-br" },
    });
  });
});

test("sheet Help section opens the shortcuts dialog", () => {
  let sheetClosed = 0;
  render(<Harness onClose={() => { sheetClosed += 1; }} />);

  const sheet = screen.getByRole("dialog");
  assert.ok(sheet.textContent?.includes("Ajuda"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Atalhos e gestos" }));

  // The sheet closed and the shared flag opened the reference dialog.
  assert.equal(sheetClosed, 1);
  assert.equal(useStudioStore.getState().shortcutsOpen, true);
  assert.ok(screen.getByText("Atalhos de teclado e gestos"));
  assert.ok(screen.getByText("Navegação"));
  assert.ok(screen.getByText("Botão direito ao lado do tabuleiro (fora das casas) ou toque longo no tabuleiro"));
});
