import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createEmptyTree, playMove } from "@/src/chess/tree.ts";
import type { BoardSession } from "@/src/store/slices/types.ts";

mock.module("next/navigation", {
  namedExports: { useRouter: () => ({ push() {} }), usePathname: () => "/studio" },
});
mock.module("@/src/lib/supabase/client", { namedExports: { createBrowserSupabase: () => null } });

const { SaveAsDialog } = await import("./SaveAsDialog.tsx");
const { FileMenuItems } = await import("./MenuBarFileMenu.tsx");
const { saveActiveBoard, saveActiveBoardAs } = await import("./save-board.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

const MOVE_E4 = { san: "e4", uci: "e2e4", fen: "fen-e4", from: "e2", to: "e4" };

function seedBoard(title = "Carlsen / Nepo: Game 1"): void {
  let tree = createEmptyTree();
  ({ tree } = playMove(tree, [], MOVE_E4));
  const board: BoardSession = {
    id: "board-save-test",
    remoteId: null,
    title,
    tree,
    path: [],
    headers: {},
    orientation: "white",
    repertoireColor: null,
    dirty: true,
    preview: false,
  };
  useStudioStore.setState({
    boards: [board],
    activeBoardId: board.id,
    user: null,
    statusMessage: null,
    saveAsOpen: false,
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
  });
}

async function withDownloadSpy(run: () => void | Promise<void>): Promise<{ name: string; text: string }[]> {
  const downloads: { name: string; text: string }[] = [];
  const g = globalThis as unknown as { URL: typeof URL };
  const blobs = new Map<string, Blob>();
  const origCreate = g.URL.createObjectURL;
  const origRevoke = g.URL.revokeObjectURL;
  let n = 0;
  g.URL.createObjectURL = ((blob: Blob) => {
    const url = `blob:${n++}`;
    blobs.set(url, blob);
    return url;
  }) as never;
  g.URL.revokeObjectURL = (() => {}) as never;
  const origClick = window.HTMLAnchorElement.prototype.click;
  const pending: Promise<void>[] = [];
  window.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const blob = blobs.get(this.href);
    pending.push(blob!.text().then((text) => void downloads.push({ name: this.download, text })));
  };
  try {
    await run();
    await Promise.all(pending);
  } finally {
    window.HTMLAnchorElement.prototype.click = origClick;
    g.URL.createObjectURL = origCreate;
    g.URL.revokeObjectURL = origRevoke;
  }
  return downloads;
}

before(() => setupDom());
after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  act(() => {
    seedBoard();
  });
});

test("SaveAsDialog pre-fills and selects the sanitised suggested name and downloads edited name", async () => {
  let closed = 0;
  const downloads = await withDownloadSpy(async () => {
    render(<SaveAsDialog onClose={() => { closed += 1; }} />);
    await Promise.resolve();
    const input = screen.getByLabelText("File name") as HTMLInputElement;
    assert.equal(input.value, "Carlsen Nepo Game 1.pgn");
    assert.equal(input.selectionStart, 0);
    assert.equal(input.selectionEnd, input.value.length);

    fireEvent.change(input, { target: { value: "My Opening" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });

  assert.equal(closed, 1);
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, "My Opening.pgn");
  assert.match(downloads[0].text, /1\. e4/);
  assert.equal(useStudioStore.getState().statusMessage, "Saved My Opening.pgn");
});

test("SaveAsDialog falls back to suggested name when input is empty or whitespace-only", async () => {
  act(() => seedBoard("Board"));
  const downloads = await withDownloadSpy(() => {
    render(<SaveAsDialog onClose={() => {}} />);
    const input = screen.getByLabelText("File name") as HTMLInputElement;
    assert.equal(input.value, "Board.pgn");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);
  });

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, "Board.pgn");
  assert.equal(useStudioStore.getState().statusMessage, "Saved Board.pgn");
});

test("SaveAsDialog Cancel and Escape download nothing and set no status message", async () => {
  let closed = 0;
  const downloads = await withDownloadSpy(() => {
    const { rerender } = render(<SaveAsDialog onClose={() => { closed += 1; }} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    assert.equal(closed, 1);

    rerender(<SaveAsDialog onClose={() => { closed += 1; }} />);
    fireEvent.keyDown(window, { key: "Escape" });
    assert.equal(closed, 2);
  });

  assert.equal(downloads.length, 0);
  assert.equal(useStudioStore.getState().statusMessage, null);
});

test("saveActiveBoardAs uses window.showSaveFilePicker when available and skips modal", async () => {
  const written: string[] = [];
  let closed = false;
  let pickerOptions: unknown = null;

  (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker = async (options: unknown) => {
    pickerOptions = options;
    return {
      name: "picked.pgn",
      createWritable: async () => ({
        write: async (text: string) => {
          written.push(text);
        },
        close: async () => {
          closed = true;
        },
      }),
    };
  };

  await saveActiveBoardAs();

  assert.deepEqual(pickerOptions, {
    suggestedName: "Carlsen Nepo Game 1.pgn",
    types: [{ description: "PGN", accept: { "application/x-chess-pgn": [".pgn"] } }],
  });
  assert.equal(written.length, 1);
  assert.match(written[0], /1\. e4/);
  assert.equal(closed, true);
  assert.equal(useStudioStore.getState().saveAsOpen, false);
  assert.equal(useStudioStore.getState().statusMessage, "Saved picked.pgn");
});

test("saveActiveBoardAs treats AbortError as silent cancel and falls back on other errors", async () => {
  (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker = async () => {
    const err = new Error("User aborted");
    err.name = "AbortError";
    throw err;
  };

  const downloads = await withDownloadSpy(async () => {
    await saveActiveBoardAs();
  });
  assert.equal(downloads.length, 0);
  assert.equal(useStudioStore.getState().saveAsOpen, false);
  assert.equal(useStudioStore.getState().statusMessage, null);

  (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker = async () => {
    throw new Error("SecurityError");
  };
  await saveActiveBoardAs();
  assert.equal(useStudioStore.getState().saveAsOpen, true);
});

test("Menu Save and saveActiveBoard share the same signed-out download and status behaviour", async () => {
  let menuClosed = 0;
  const menuDownloads = await withDownloadSpy(async () => {
    render(
      <div role="menu">
        <FileMenuItems
          onOpenPgn={() => {}}
          onShare={() => {}}
          close={() => {
            menuClosed += 1;
          }}
          run={(fn) => fn}
        />
      </div>,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /^Save\s+Ctrl\+S$/ }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(menuClosed, 1);
  assert.equal(menuDownloads.length, 1);
  assert.equal(menuDownloads[0].name, "Carlsen Nepo Game 1.pgn");
  assert.equal(
    useStudioStore.getState().statusMessage,
    "Saved as PGN file (sign in to save in the cloud)",
  );

  act(() => {
    useStudioStore.getState().setStatus(null);
  });

  const directDownloads = await withDownloadSpy(async () => {
    await saveActiveBoard();
  });
  assert.deepEqual(directDownloads, menuDownloads);
  assert.equal(
    useStudioStore.getState().statusMessage,
    "Saved as PGN file (sign in to save in the cloud)",
  );
});
