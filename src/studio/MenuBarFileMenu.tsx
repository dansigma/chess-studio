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
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";

// SIG-857: file-menu subscriptions live here so the closed MenuBar root does
// not re-render on board changes. The only value subscription is the active
// title primitive; board tree/path are read via getState() inside handlers,
// and the rest are stable action refs (no re-render).
// SIG-1109: the item list is factored into FileMenuItems so the mobile
// bottom sheet reuses the same actions without duplicating menu code. The
// exported component keeps the desktop menu contract unchanged; the mobile
// sheet renders FileMenuItems directly with its own run/close wiring.
export function FileMenuItems({
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
  const locale = useStudioStore((state) => state.settings.locale);
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
    setStatus(tStudioChrome(locale, "chrome.status.pgnCopied"));
    close();
  }

  async function copyFen() {
    try {
      const active = useStudioStore.getState().active();
      const fen = fenToCopy(getFenAt(active.tree, active.path));
      await navigator.clipboard.writeText(fen);
      setStatus(tStudioChrome(locale, "chrome.status.fenCopied"));
    } catch {
      setStatus(tStudioChrome(locale, "chrome.status.fenFailed"));
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
        setStatus(tStudioChrome(locale, "chrome.status.cannotShare"));
        return;
      }
      url = shareBoardUrl(window.location.origin, fen);
    } catch {
      setStatus(tStudioChrome(locale, "chrome.status.cannotShare"));
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
      setStatus(tStudioChrome(locale, "chrome.status.boardNotOpen"));
      close();
      return;
    }
    try {
      const blob = await boardPngBlob(element);
      try {
        await copyPngToClipboard(blob);
        setStatus(tStudioChrome(locale, "chrome.status.imageCopied"));
      } catch {
        downloadPng(blob, "board.png");
        setStatus(tStudioChrome(locale, "chrome.status.imageDownloaded"));
      }
    } catch {
      setStatus(tStudioChrome(locale, "chrome.status.imageFailed"));
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
        setStatus(tStudioChrome(locale, "chrome.status.savedPgnFile"));
        return;
      }
      useStudioStore.getState().markSaved(active.id, remoteId);
      setStatus(tStudioChrome(locale, "chrome.status.boardSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : tStudioChrome(locale, "chrome.status.saveFailed"));
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
      <Item label={tStudioChrome(locale, "chrome.file.newBoard")} shortcut="Ctrl+N" onClick={run(handleNewBoard)} />
      <Item label={tStudioChrome(locale, "chrome.file.openPgn")} shortcut="Ctrl+O" onClick={run(onOpenPgn)} />
      <Item label={tStudioChrome(locale, "chrome.file.openClipboard")} onClick={() => void openClipboard()} />
      <Divider />
      <Item label={tStudioChrome(locale, "chrome.file.save")} shortcut="Ctrl+S" onClick={() => void saveBoard()} />
      <Item label={tStudioChrome(locale, "chrome.file.saveAs")} shortcut="Ctrl+Shift+S" onClick={() => downloadPgn(`${activeTitle}.pgn`)} />
      <Item label={tStudioChrome(locale, "chrome.file.exportPgn")} onClick={() => downloadPgn(`${activeTitle}.pgn`)} />
      <Divider />
      <Item label={tStudioChrome(locale, "chrome.file.copyPgn")} onClick={() => void copyPgn()} />
      <Item label={tStudioChrome(locale, "chrome.file.copyFen")} onClick={() => void copyFen()} />
      <Item label={tStudioChrome(locale, "chrome.file.copyImage")} onClick={() => void copyBoardImage()} />
      <Item label={tStudioChrome(locale, "chrome.file.share")} onClick={() => void shareBoard()} />
      <Item label={tStudioChrome(locale, "chrome.file.print")} shortcut="Ctrl+P" onClick={() => void printBoard()} />
      <Divider />
      <Item label={tStudioChrome(locale, "chrome.file.clone")} onClick={run(handleCloneBoard)} />
      <Item label={tStudioChrome(locale, "chrome.file.closeBoard")} shortcut="Ctrl+Q" onClick={run(handleCloseBoard)} />
    </>
  );
}

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
  return <FileMenuItems onOpenPgn={onOpenPgn} onShare={onShare} close={close} run={run} />;
}
