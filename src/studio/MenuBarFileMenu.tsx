"use client";

import { persistBoard, selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { getFenAt } from "@/src/chess/tree";
import { boardImageElement, fenToCopy } from "@/src/chess/copy-board";
import { shareBoardUrl } from "@/src/chess/share-board";
import { isLegalSetupFen } from "@/src/chess/setup-fen";
import { boardPngBlob, copyPngToClipboard, downloadPng } from "@/src/chess/copy-board-image";
import { printActiveBoard } from "./print-board";
import { closeBoardPanel, openBoardPanel, openStudioPanel } from "./dock-api";
import { MenuDivider as Divider, MenuItem as Item } from "./ui/Menu";

// SIG-857: file-menu subscriptions live here so the closed MenuBar root does
// not re-render on board changes. The only value subscription is the active
// title primitive; board tree/path are read via getState() inside handlers,
// and the rest are stable action refs (no re-render).
export function MenuBarFileMenu({
  onOpenPgn,
  onShare,
  close,
  run,
}: {
  onOpenPgn: () => void;
  onShare: (url: string, copied: boolean) => void;
  close: () => void;
  run: (action: () => void) => () => void;
}) {
  const activeTitle = useStudioStore((state) => selectActiveBoard(state).title);
  const setStatus = useStudioStore((state) => state.setStatus);
  const exportActivePgn = useStudioStore((state) => state.exportActivePgn);
  const openPgnSource = useStudioStore((state) => state.openPgnSource);

  // SIG-907: File-menu board actions stay store-driven but must keep the
  // `board:*` panels in sync: creation opens the new session's panel, and
  // closing the active board closes its panel (tracked so the dock remove
  // handler skips the echo). Closing the last board seeds a fresh session
  // whose panel we open explicitly.
  function handleNewBoard(): void {
    useStudioStore.getState().newBoard();
    const active = selectActiveBoard(useStudioStore.getState());
    openBoardPanel(active.id, active.title);
  }

  function handleCloneBoard(): void {
    useStudioStore.getState().cloneBoard();
    const active = selectActiveBoard(useStudioStore.getState());
    openBoardPanel(active.id, active.title);
  }

  function handleCloseBoard(): void {
    const before = useStudioStore.getState();
    const target = before.activeBoardId;
    before.closeBoard();
    closeBoardPanel(target);
    // SIG-915: closing the active tab focuses the store-chosen neighbor
    // (previous else next), so its tab gets focus after removal. The last
    // board reseeds a fresh session whose panel we open explicitly.
    const active = selectActiveBoard(useStudioStore.getState());
    openBoardPanel(active.id, active.title);
  }

  async function copyPgn() {
    await navigator.clipboard.writeText(exportActivePgn());
    setStatus("PGN copied to clipboard");
    close();
  }

  async function copyFen() {
    try {
      const active = useStudioStore.getState().active();
      const fen = fenToCopy(getFenAt(active.tree, active.path));
      await navigator.clipboard.writeText(fen);
      setStatus("FEN copied to clipboard");
    } catch {
      setStatus("Could not copy FEN");
    }
    close();
  }

  async function shareBoard() {
    close();
    let url: string;
    try {
      const active = useStudioStore.getState().active();
      const fen = fenToCopy(getFenAt(active.tree, active.path));
      if (!isLegalSetupFen(fen)) {
        setStatus("This position cannot be shared");
        return;
      }
      url = shareBoardUrl(window.location.origin, fen);
    } catch {
      setStatus("This position cannot be shared");
      return;
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      copied = false;
    }
    onShare(url, copied);
  }

  async function copyBoardImage() {
    const element = boardImageElement();
    if (!element) {
      setStatus("Board is not open");
      close();
      return;
    }
    try {
      const blob = await boardPngBlob(element);
      try {
        await copyPngToClipboard(blob);
        setStatus("Board image copied");
      } catch {
        downloadPng(blob, "board.png");
        setStatus("Board image downloaded");
      }
    } catch {
      setStatus("Could not copy the board image");
    }
    close();
  }

  function downloadPgn(filename: string) {
    const blob = new Blob([exportActivePgn()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    close();
  }

  async function saveBoard() {
    try {
      const active = useStudioStore.getState().active();
      const remoteId = await persistBoard(active);
      if (!remoteId) {
        downloadPgn(`${active.title}.pgn`);
        setStatus("Saved as PGN file (sign in to save in the cloud)");
        return;
      }
      useStudioStore.getState().markSaved(active.id, remoteId);
      setStatus("Board saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    }
    close();
  }

  async function printBoard() {
    close();
    await printActiveBoard();
  }

  async function openClipboard() {
    const text = await navigator.clipboard.readText();
    openPgnSource("Clipboard", text);
    openStudioPanel("fileGames");
    close();
  }

  return (
    <>
      <Item label="New empty board" shortcut="Ctrl+N" onClick={run(handleNewBoard)} />
      <Item label="Open PGN…" shortcut="Ctrl+O" onClick={run(onOpenPgn)} />
      <Item label="Open from clipboard" onClick={() => void openClipboard()} />
      <Divider />
      <Item label="Save" shortcut="Ctrl+S" onClick={() => void saveBoard()} />
      <Item label="Save as…" shortcut="Ctrl+Shift+S" onClick={() => downloadPgn(`${activeTitle}.pgn`)} />
      <Item label="Export PGN" onClick={() => downloadPgn(`${activeTitle}.pgn`)} />
      <Divider />
      <Item label="Copy PGN" onClick={() => void copyPgn()} />
      <Item label="Copy FEN" onClick={() => void copyFen()} />
      <Item label="Copy board image" onClick={() => void copyBoardImage()} />
      <Item label="Share board…" onClick={() => void shareBoard()} />
      <Item label="Print" shortcut="Ctrl+P" onClick={() => void printBoard()} />
      <Divider />
      <Item label="Clone board" onClick={run(handleCloneBoard)} />
      <Item label="Close board" shortcut="Ctrl+Q" onClick={run(handleCloseBoard)} />
    </>
  );
}
