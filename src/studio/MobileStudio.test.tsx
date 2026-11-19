import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

mock.module("next/navigation", {
  namedExports: {
    useRouter: () => ({ push() {}, replace() {}, prefetch() {} }),
    usePathname: () => "/studio",
  },
});

const { MobileStudio } = await import("./MobileStudio.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

function setMobileViewport() {
  Object.defineProperty(window, "innerWidth", { value: 390, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: 844, configurable: true, writable: true });
}

before(() => {
  setupDom();
  setMobileViewport();
});

after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  setMobileViewport();
  act(() => {
    useStudioStore.setState({
      workspaceView: "studio",
      user: null,
      settings: { ...DEFAULT_SETTINGS, locale: "en" },
    });
    const store = useStudioStore.getState();
    const first = store.boards[0];
    if (first) {
      useStudioStore.setState({
        boards: [{ ...first, title: "Board" }],
        activeBoardId: first.id,
        files: { folders: [], databases: [] },
        activeFileDatabaseId: null,
        activeFileGameId: null,
      });
    }
  });
});

test("top bar shows active board title, count badge when > 1, and switches/creates/renames/closes boards", () => {
  render(<MobileStudio onOpenPgn={() => {}} />);

  const switcher = screen.getByRole("button", { name: "Switch board" });
  assert.equal(switcher.textContent?.includes("Board"), true);
  assert.equal(switcher.querySelector("[data-mobile-board-count]"), null);

  // Create a second board via store and verify count badge appears.
  act(() => {
    useStudioStore.getState().newBoard();
    useStudioStore.getState().renameActive("Sicilian Prep");
  });

  const badge = switcher.querySelector("[data-mobile-board-count]");
  assert.equal(badge?.textContent, "2");
  assert.equal(switcher.textContent?.includes("Sicilian Prep"), true);

  // Open board switcher BottomSheet.
  fireEvent.click(switcher);
  const sheet = document.querySelector("[data-mobile-menu-sheet]");
  assert.ok(sheet, "board switcher BottomSheet should open");

  // Access My Games and Bookmarks tabs inside the sheet.
  const myGamesTab = within(sheet as HTMLElement).getByRole("tab", { name: "My Games" });
  fireEvent.click(myGamesTab);
  assert.equal(myGamesTab.getAttribute("aria-selected"), "true");

  const bookmarksTab = within(sheet as HTMLElement).getByRole("tab", { name: "Bookmarks" });
  fireEvent.click(bookmarksTab);
  assert.equal(bookmarksTab.getAttribute("aria-selected"), "true");

  // Back to Boards tab.
  const boardsTab = within(sheet as HTMLElement).getByRole("tab", { name: "Open boards" });
  fireEvent.click(boardsTab);

  // Rename the active board from the sheet.
  const renameButtons = within(sheet as HTMLElement).getAllByRole("button", { name: "Rename board" });
  fireEvent.click(renameButtons[1]!);
  const renameInput = within(sheet as HTMLElement).getByRole("textbox", { name: "Rename board" }) as HTMLInputElement;
  fireEvent.change(renameInput, { target: { value: "Najdorf Notes" } });
  fireEvent.click(within(sheet as HTMLElement).getByRole("button", { name: "Save" }));
  assert.equal(useStudioStore.getState().boards[1]?.title, "Najdorf Notes");

  // Select the first board; sheet closes and top bar updates.
  fireEvent.click(within(sheet as HTMLElement).getByText("Board"));
  assert.equal(document.querySelector("[data-mobile-menu-sheet]"), null);
  assert.equal(useStudioStore.getState().activeBoardId, useStudioStore.getState().boards[0]?.id);
  assert.equal(screen.getByRole("button", { name: "Switch board" }).textContent?.includes("Board"), true);

  // Re-open sheet and close the second board.
  fireEvent.click(screen.getByRole("button", { name: "Switch board" }));
  const reopened = document.querySelector("[data-mobile-menu-sheet]") as HTMLElement;
  const closeButtons = within(reopened).getAllByRole("button", { name: "Close board" });
  fireEvent.click(closeButtons[1]!);
  assert.equal(useStudioStore.getState().boards.length, 1);
});

test("top bar shows <- Board action in Library and Live and returns to studio in one tap", () => {
  render(<MobileStudio onOpenPgn={() => {}} />);

  act(() => {
    useStudioStore.getState().setWorkspaceView("library");
  });
  const backFromLibrary = screen.getByRole("button", { name: "Back to board" });
  assert.ok(backFromLibrary);
  fireEvent.click(backFromLibrary);
  assert.equal(useStudioStore.getState().workspaceView, "studio");

  act(() => {
    useStudioStore.getState().setWorkspaceView("live");
  });
  const backFromLive = screen.getByRole("button", { name: "Back to board" });
  assert.ok(backFromLive);
  fireEvent.click(backFromLive);
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("multi-game PGN BottomSheet lists games and closes on selection", () => {
  const multiPgn = `[Event "Game 1"]
[White "Alpha"]
[Black "Beta"]
[Result "1-0"]

1. e4 e5 1-0

[Event "Game 2"]
[White "Gamma"]
[Black "Delta"]
[Result "0-1"]

1. d4 d5 0-1`;

  act(() => {
    useStudioStore.getState().openPgnSource("Club Match", multiPgn);
  });

  let closed = 0;
  render(
    <MobileStudio
      onOpenPgn={() => {}}
      fileGamesOpen
      onCloseFileGames={() => {
        closed += 1;
      }}
    />,
  );

  const sheet = document.querySelector("[data-mobile-menu-sheet]") as HTMLElement;
  assert.ok(sheet, "fileGames BottomSheet should render");
  const secondGame = within(sheet).getByText(/Gamma.*Delta|Game 2/);
  fireEvent.click(secondGame);
  assert.equal(closed, 1);
});

test("More tab exposes Insights and Repertoire, and hamburger sheet includes Account / Sign-in", () => {
  render(<MobileStudio onOpenPgn={() => {}} />);

  // Switch to More tab.
  const moreTab = screen.getByRole("tab", { name: "More" });
  fireEvent.click(moreTab);
  assert.equal(moreTab.getAttribute("aria-selected"), "true");
  assert.ok(screen.getByRole("tab", { name: "Insights" }));
  const repertoireTab = screen.getByRole("tab", { name: "Repertoire" });
  fireEvent.click(repertoireTab);
  assert.equal(repertoireTab.getAttribute("aria-selected"), "true");

  // Open hamburger sheet signed out -> Sign in link.
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
  const accountSection = document.querySelector("[data-mobile-account-section]") as HTMLElement;
  assert.ok(accountSection);
  const signInLink = within(accountSection).getByRole("link", { name: "Sign in" });
  assert.equal(signInLink.getAttribute("href"), "/login");

  // Sign in -> shows email + AccountSection + Sign out.
  act(() => {
    useStudioStore.getState().setUser({ id: "u1", email: "gm@chess.dev", displayName: "GM User" });
  });
  assert.ok(within(accountSection).getByText("GM User"));
  assert.ok(within(accountSection).getByText("gm@chess.dev"));
  assert.ok(within(accountSection).getByRole("button", { name: "Sign out" }));
});
