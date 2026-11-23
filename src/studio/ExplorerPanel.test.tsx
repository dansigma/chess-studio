// SIG-1211: the Chess.com explorer source indexes only the loaded Chess.com
// player's games. With none loaded it explains why the list is empty, and once
// a player is loaded the source selector names them.
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExplorerPanel } from "./ExplorerPanel";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { importPgn } from "@/src/chess/pgn";
import { getFenAt } from "@/src/chess/tree";
import type { ExplorerResponse } from "@/src/lib/explorer-types";

before(() => {
  setupDom();
});

afterEach(() => {
  cleanup();
  useStudioStore.setState({ playerProfile: null, playerGames: [], explorer: null });
});

after(() => {
  teardownDom();
});

test("chesscom source with no player loaded explains the empty list", async () => {
  useStudioStore.setState({ playerProfile: null, playerGames: [], databaseSource: "chesscom" });
  await act(async () => {
    render(<ExplorerPanel />);
  });
  assert.ok(screen.getByText(/Search for a Chess\.com player/));
  const option = screen.getByRole("option", { name: "Chess.com" });
  assert.ok(option);
});

test("chesscom source names the loaded player and drops the hint", async () => {
  useStudioStore.setState({
    playerProfile: {
      id: "chesscom:hikaru",
      source: "chesscom",
      username: "hikaru",
      displayName: "GM Hikaru Nakamura",
      subtitle: "Chess.com · hikaru",
    },
    playerGames: [],
    databaseSource: "chesscom",
  });
  await act(async () => {
    render(<ExplorerPanel />);
  });
  assert.ok(screen.getByRole("option", { name: "Chess.com · hikaru" }));
  assert.equal(screen.queryByText(/Search for a Chess\.com player/), null);
  assert.ok(screen.getByText("No games for this position."));
});

test("SIG-1385: empty state offers switching to another source", async () => {
  useStudioStore.setState({ playerProfile: null, playerGames: [], databaseSource: "masters" });
  useStudioStore.setState({
    explorer: { fen: "x", source: "masters", white: 0, draws: 0, black: 0, opening: null, games: [], moves: [] } as never,
    explorerLoading: false,
    explorerError: null,
  });
  await act(async () => {
    render(<ExplorerPanel />);
  });
  assert.ok(screen.getByText("No games for this position."));
  // Masters falls back to Lichess ("Online Database"), the broadest shared DB.
  fireEvent.click(screen.getByRole("button", { name: "Try Online Database" }));
  assert.equal(useStudioStore.getState().databaseSource, "lichess");
});

test("SIG-1299: Total row shares the rows' grid, scroller and cell structure", async () => {
  useStudioStore.setState({ playerProfile: null, playerGames: [], databaseSource: "masters" });
  const payload = {
    source: "masters",
    fen: "x",
    white: 60,
    draws: 20,
    black: 20,
    opening: null,
    games: [],
    moves: [
      { san: "e4", uci: "e2e4", games: 70, white: 40, draws: 15, black: 15, averageRating: null },
      { san: "d4", uci: "d2d4", games: 30, white: 20, draws: 5, black: 5, averageRating: null },
    ],
  };
  useStudioStore.setState({ explorer: payload as never, explorerLoading: false, explorerError: null });
  await act(async () => {
    render(<ExplorerPanel />);
  });
  const total = screen.getByTestId("explorer-total-row");
  const rows = Array.from(total.parentElement!.querySelectorAll("button[title]"));
  assert.ok(rows.length > 0);
  const row = rows[0] as HTMLElement;
  const gridClass = (el: Element) => el.className.split(/\s+/).filter((c) => c.startsWith("grid") || c.startsWith("gap-") || c.startsWith("px-") || c === "items-center").sort().join(" ");
  assert.equal(gridClass(total), gridClass(row));
  assert.match(total.className, /\bgrid-cols-\[64px_minmax\(0,1fr\)_minmax\(170px,220px\)\]/);
  // Same scroll container as the rows.
  assert.equal(total.parentElement, row.parentElement);
  assert.match(total.parentElement!.className, /overflow-auto/);
  assert.match(total.className, /sticky/);
  assert.match(total.className, /bg-studio-panel/);
  // Count cell: same width/shrink/alignment; bar wrapped in <span class="relative">.
  const rowCount = row.children[2]!.children[0] as HTMLElement;
  const totalCount = total.children[1]!.children[0] as HTMLElement;
  for (const cls of ["w-11", "shrink-0", "text-right", "tabular-nums"]) {
    assert.ok(rowCount.className.includes(cls) && totalCount.className.includes(cls), cls);
  }
  const rowBar = row.children[row.children.length - 1] as HTMLElement;
  const totalBar = total.children[2] as HTMLElement;
  assert.equal(totalBar.tagName, rowBar.tagName);
  assert.equal(totalBar.className, rowBar.className);
});

test("SIG-1443: the opening header is translated only when the site language is Portuguese", async () => {
  const opening = { eco: "D31", name: "Queen's Gambit Declined: Charousek Variation" };
  const { tree, path } = selectActiveBoard(useStudioStore.getState());
  const explorer: ExplorerResponse = { fen: getFenAt(tree, path), source: "masters", white: 1, draws: 0, black: 0, opening, games: [], moves: [] };
  const settings = useStudioStore.getState().settings;
  try {
    for (const [locale, expected] of [
      ["pt-br", "Gambito da Dama Recusado: Variante Charousek"],
      ["en", "Queen's Gambit Declined: Charousek Variation"],
    ] as const) {
      useStudioStore.setState({ settings: { ...settings, locale }, databaseSource: "masters", explorer, explorerLoading: false, explorerError: null });
      await act(async () => {
        render(<ExplorerPanel />);
      });
      assert.ok(screen.getByText(expected));
      cleanup();
    }
  } finally {
    useStudioStore.setState({ settings });
  }
});

test("SIG-1447: falls back to the active line and gives an exact source opening priority", async () => {
  const before = useStudioStore.getState();
  const board = selectActiveBoard(before);
  const { tree } = importPgn("1. d4 d5 2. Nc3 Nf6 3. Bf4 e6 4. Nb5");
  const path = Array<number>(7).fill(0);
  const explorer: ExplorerResponse = {
    fen: getFenAt(tree, path), source: "masters", white: 0, draws: 0, black: 0,
    opening: null, games: [], moves: [],
  };
  const setPath = (path: number[]) => {
    useStudioStore.setState({
      boards: before.boards.map((candidate) => candidate.id === board.id ? { ...board, tree, path } : candidate),
    });
  };
  try {
    setPath(path);
    useStudioStore.setState({
      explorer, explorerLoading: false, explorerError: null, databaseSource: "masters",
      settings: { ...before.settings, locale: "pt-br" },
    });
    render(<ExplorerPanel />);
    assert.ok(await screen.findByText("Sistema Rapport-Jobava"));
    assert.ok(screen.getByText("D01"));

    await act(async () => {
      useStudioStore.setState({ explorer: { ...explorer, opening: { eco: "A00", name: "Source opening" } } });
    });
    assert.ok(screen.getByText("Source opening"));
    assert.ok(screen.getByText("A00"));

    await act(async () => setPath([]));
    assert.ok(screen.getByText("Sem nome de abertura"));
  } finally {
    cleanup();
    useStudioStore.setState({ boards: before.boards, settings: before.settings });
  }
});

test("Base Xadrez Digital shows rating and year filters and explains the unfiltered move totals", () => {
  const { settings } = useStudioStore.getState();
  const note = "Percentages cover all games; filters apply to the games list";
  const { tree, path } = selectActiveBoard(useStudioStore.getState());
  const explorer: ExplorerResponse = {
    source: "xadrez-digital", fen: getFenAt(tree, path), opening: null, white: 3, draws: 1, black: 1,
    games: [],
    moves: [{ san: "e4", uci: "e2e4", games: 5, white: 3, draws: 1, black: 1, averageRating: 2450 }],
  };
  try {
    useStudioStore.setState({ databaseSource: "xadrez-digital", explorer, explorerLoading: false, explorerError: null });
    render(<ExplorerPanel />);
    assert.equal(screen.queryByText(note), null);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    assert.ok(screen.getByRole("dialog", { name: "Filters" }));
    assert.ok(screen.getByRole("textbox", { name: "From" }));
    assert.ok(screen.getByRole("textbox", { name: "To" }));
    assert.equal(screen.queryByText("Speed"), null);
    assert.equal(screen.queryByRole("button", { name: "1800+" }), null);
    for (const name of ["All", "2300+", "2500+", "2700+"]) {
      assert.ok(screen.getByRole("button", { name }));
    }
    fireEvent.click(screen.getByRole("button", { name: "2700+" }));
    assert.ok(screen.getByText(note));
    assert.match(screen.getByTestId("explorer-total-row").textContent ?? "", /5/);
    const source = screen.getByRole("combobox", { name: "Explorer source" });
    fireEvent.change(source, { target: { value: "lichess" } });
    assert.equal(screen.queryByText(note), null);
    assert.equal(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed"), "true");
    fireEvent.change(source, { target: { value: "xadrez-digital" } });
    assert.equal(screen.getByRole("button", { name: "2700+" }).getAttribute("aria-pressed"), "true");
  } finally {
    cleanup();
    useStudioStore.setState({ settings });
  }
});
