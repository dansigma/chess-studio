// SIG-1455: panel-local position lock for Explorer / Games / player panels.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { importPgn } from "@/src/chess/pgn";
import { findPathForFen, getFenAt } from "@/src/chess/tree";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import type { ExplorerResponse } from "@/src/lib/explorer-types";
import { ExplorerPanel } from "./ExplorerPanel";
import { GamesPanel } from "./GamesPanel";
import { useExplorerData } from "./use-explorer-data";
import { useLockablePosition } from "./use-lockable-position";

before(() => setupDom());
after(() => teardownDom());

const initial = useStudioStore.getState();
const PGN = "1. e4 e5 2. Nf3 (2. Bc4 Nf6) 2... Nc6 3. Bb5";

function seed(path: number[]) {
  const board = selectActiveBoard(initial);
  const { tree } = importPgn(PGN);
  useStudioStore.setState({
    boards: initial.boards.map((item) => (item.id === board.id ? { ...board, tree, path } : item)),
  });
  return tree;
}
const setPath = (path: number[]) => act(async () => useStudioStore.getState().goPath(path));

afterEach(() => {
  cleanup();
  useStudioStore.setState({
    boards: initial.boards, explorer: null, explorerLoading: false, explorerError: null,
    settings: initial.settings, databaseSource: initial.databaseSource,
  });
});

test("findPathForFen finds sideline nodes, prefers the given path, null when absent", () => {
  const tree = seed([]);
  const side = [0, 0, 1, 0]; // 1.e4 e5 2.Bc4 Nf6
  assert.deepEqual(findPathForFen(tree, getFenAt(tree, side)), side);
  assert.deepEqual(findPathForFen(tree, tree.startFen), []);
  assert.equal(findPathForFen(tree, "8/8/8/8/8/8/8/K6k w - - 0 1"), null);
});

test("lock keeps the position while the board moves; unlock re-syncs", async () => {
  const tree = seed([0, 0, 0]);
  const lockedFen = getFenAt(tree, [0, 0, 0]);
  const { result } = renderHook(() => useLockablePosition());
  assert.equal(result.current.locked, false);
  assert.equal(result.current.fen, lockedFen);
  act(() => result.current.lock());
  assert.equal(result.current.locked, true);
  assert.equal(result.current.lockedLabel, "2.Nf3");
  assert.deepEqual(result.current.lockedPath, [0, 0, 0]);

  await setPath([0, 0, 0, 0, 0]);
  assert.equal(result.current.fen, lockedFen);
  assert.equal(result.current.canPlay, true);
  act(() => result.current.unlock());
  assert.equal(result.current.fen, getFenAt(tree, [0, 0, 0, 0, 0]));
});

test("label for black moves uses an ellipsis, start position has none", async () => {
  seed([0, 0]);
  const { result } = renderHook(() => useLockablePosition());
  act(() => result.current.lock());
  assert.equal(result.current.lockedLabel, "1…e5");
  act(() => result.current.unlock());
  await setPath([]);
  act(() => result.current.lock());
  assert.equal(result.current.lockedLabel, null);
});

test("playing from a locked position inside the game navigates there first", async () => {
  const tree = seed([0, 0, 0]); // 1.e4 e5 2.Nf3
  const { result } = renderHook(() => useLockablePosition());
  act(() => result.current.lock());
  await setPath([0, 0, 0, 0, 0]);
  let ok = false;
  act(() => { ok = result.current.playUci("d7", "d6"); });
  assert.equal(ok, true);
  const board = selectActiveBoard(useStudioStore.getState());
  assert.equal(board.path.length, 4);
  assert.equal(board.tree.children[0].children[0].children[0].children.some((node) => node.san === "d6"), true);
  assert.equal(getFenAt(tree, [0, 0, 0]), result.current.fen);
});

test("a locked position outside the game disables playing", async () => {
  seed([0, 0]);
  const { result } = renderHook(() => useLockablePosition());
  act(() => result.current.lock());
  const other = importPgn("1. d4 d5").tree;
  const board = selectActiveBoard(useStudioStore.getState());
  await act(async () => useStudioStore.setState({
    boards: useStudioStore.getState().boards.map((item) => (item.id === board.id ? { ...board, tree: other, path: [] } : item)),
  }));
  assert.equal(result.current.canPlay, false);
  let ok = true;
  act(() => { ok = result.current.playUci("e2", "e4"); });
  assert.equal(ok, false);
});

function payload(fen: string, san = "e4", uci = "e7e5"): ExplorerResponse {
  return {
    source: "masters", fen, white: 1, draws: 0, black: 0, opening: null, games: [],
    moves: [{ san, uci, games: 1, white: 1, draws: 0, black: 0, averageRating: null }],
  } as ExplorerResponse;
}

test("a stale response for the unlocked FEN does not overwrite locked data", async (t) => {
  const tree = seed([0, 0, 0]);
  const lockedFen = getFenAt(tree, [0, 0, 0]);
  const pending = new Map<string, PromiseWithResolvers<Response>>();
  t.mock.method(globalThis, "fetch", (input: string) => {
    const fen = decodeURIComponent(new URL(input, "http://x").searchParams.get("fen")!);
    const deferred = Promise.withResolvers<Response>();
    pending.set(fen, deferred);
    return deferred.promise;
  });
  const { result, rerender } = renderHook(({ fen }: { fen: string | null }) => useExplorerData("masters", 0, false, fen), {
    initialProps: { fen: null as string | null },
  });
  await waitFor(() => assert.equal(pending.size, 1)); // follows the board
  const boardFen = lockedFen;
  rerender({ fen: lockedFen });
  // The board moves on while locked: the hook ignores it.
  await setPath([0, 0, 0, 0]);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(pending.size, 1);
  await act(async () => pending.get(boardFen)!.resolve(Response.json(payload(boardFen, "Locked"))));
  assert.equal(result.current.explorer?.moves[0].san, "Locked");
  void tree;
});

test("ExplorerPanel keeps the locked data while the board FEN changes and unlocks back", async (t) => {
  const tree = seed([0]);
  const fens: string[] = [];
  t.mock.method(globalThis, "fetch", (input: string) => {
    const fen = decodeURIComponent(new URL(input, "http://x").searchParams.get("fen")!);
    fens.push(fen);
    return Promise.resolve(Response.json(payload(fen, fen === getFenAt(tree, [0]) ? "Lockd" : "Other")));
  });
  const locked = getFenAt(tree, [0]);
  useStudioStore.setState({
    databaseSource: "masters", explorerLoading: false, explorerError: null,
    explorer: payload(locked, "Shared"),
  });
  await act(async () => { render(<ExplorerPanel />); });
  fireEvent.click(screen.getByRole("button", { name: "Lock position" }));
  assert.ok(await screen.findByText("Lockd"));
  const lockButton = screen.getByRole("button", { name: "Locked at 1.e4 — click to unlock" });
  assert.equal(lockButton.getAttribute("aria-pressed"), "true");

  // Board moves; the shared feed (StudioShell) now carries another position.
  await setPath([0, 0, 0]);
  const moved = getFenAt(tree, [0, 0, 0]);
  await act(async () => useStudioStore.setState({ explorer: payload(moved, "Other") }));
  assert.ok(screen.getByText("Lockd"));
  assert.equal(screen.queryByText("Other"), null);

  // Clicking a row in the locked panel goes to the locked node, then plays.
  fireEvent.click(screen.getByRole("button", { name: /Lockd/ }));
  const board = selectActiveBoard(useStudioStore.getState());
  assert.equal(board.path.length, 2);
  assert.equal(board.tree.children[0].children[0].san, "e5");

  fireEvent.click(lockButton);
  assert.ok(await screen.findByText("Other"));
});

test("a locked position outside the current game disables explorer moves", async (t) => {
  seed([0]);
  t.mock.method(globalThis, "fetch", (input: string) => {
    const fen = decodeURIComponent(new URL(input, "http://x").searchParams.get("fen")!);
    return Promise.resolve(Response.json(payload(fen, "Lockd")));
  });
  useStudioStore.setState({ databaseSource: "masters", explorer: null, explorerLoading: false });
  await act(async () => { render(<ExplorerPanel />); });
  fireEvent.click(screen.getByRole("button", { name: "Lock position" }));
  const row = await screen.findByText("Lockd");
  const board = selectActiveBoard(useStudioStore.getState());
  await act(async () => useStudioStore.setState({
    boards: useStudioStore.getState().boards.map((item) => (item.id === board.id ? { ...board, tree: importPgn("1. d4").tree, path: [] } : item)),
  }));
  const button = row.closest("button")!;
  assert.equal(button.disabled, true);
  assert.equal(button.title, "Locked position is outside the current game");
});

test("GamesPanel has its own lock and keeps its games while locked", async (t) => {
  const tree = seed([0]);
  const locked = getFenAt(tree, [0]);
  const row = (name: string) => ({
    id: name, whiteName: name, blackName: "B", whiteRating: null, blackRating: null, winner: null,
    year: 2000, month: 1, eco: "C20", event: null,
  });
  t.mock.method(globalThis, "fetch", (input: string) => {
    const fen = decodeURIComponent(new URL(input, "http://x").searchParams.get("fen")!);
    return Promise.resolve(Response.json({ ...payload(fen), games: [row("LockedGame")] }));
  });
  useStudioStore.setState({
    databaseSource: "masters", explorerGamesLoading: false, explorerError: null,
    explorer: { ...payload(locked), games: [row("SharedGame")] } as never,
  });
  await act(async () => { render(<GamesPanel />); });
  assert.ok(screen.getByText("SharedGame"));
  fireEvent.click(screen.getByRole("button", { name: "Lock position" }));
  assert.ok(await screen.findByText("LockedGame"));
  await act(async () => useStudioStore.setState({ explorer: { ...payload("other"), games: [row("NextGame")] } as never }));
  assert.ok(screen.getByText("LockedGame"));
  assert.equal(screen.queryByText("NextGame"), null);
  fireEvent.click(screen.getByRole("button", { name: /Locked at/ }));
  assert.ok(await screen.findByText("NextGame"));
});
