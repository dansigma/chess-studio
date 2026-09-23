"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { persistBoard, useStudioStore } from "@/src/store/studio-store";
import { BOARD_THEME_IDS, BOARD_THEMES } from "@/src/chess/board-themes";
import { PIECE_SET_IDS, PIECE_SETS } from "@/src/chess/piece-sets";
import { MOVE_NOTATION_IDS, MOVE_NOTATIONS } from "@/src/chess/move-notation";
import { COLOR_SCHEME_IDS, COLOR_SCHEMES } from "@/src/studio/color-scheme";
import { getFenAt, getMarksAt } from "@/src/chess/tree";
import { boardImageElement, fenToCopy } from "@/src/chess/copy-board";
import { shareBoardUrl } from "@/src/chess/share-board";
import { isLegalSetupFen } from "@/src/chess/setup-fen";
import { boardPngBlob, copyPngToClipboard, downloadPng } from "@/src/chess/copy-board-image";
import { printActiveBoard } from "./print-board";
import { marksAreEmpty } from "@/src/chess/marks";
import { OPEN_PANEL_ITEMS, openStudioPanel } from "./dock-api";

type MenuKey = "file" | "edit" | "view" | "help" | null;
type ViewSubmenu = "theme" | "pieces" | "notation" | "panel" | "scheme" | null;

function Item({
  label,
  shortcut,
  disabled,
  checked,
  submenu,
  onClick,
  onMouseEnter,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  submenu?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] text-studio-fg hover:bg-studio-accent hover:text-white disabled:text-studio-disabled"
    >
      <span>{checked ? `✓ ${label}` : label}</span>
      {submenu ? <ChevronRight size={14} className="ml-8 text-studio-faint" /> : null}
      {shortcut ? <span className="ml-8 text-[11px] text-studio-faint">{shortcut}</span> : null}
    </button>
  );
}

function Divider() {
  return <div className="my-1 border-t border-studio-border" />;
}

export function MenuBar({
  onOpenPgn,
}: {
  onOpenPgn: () => void;
}) {
  const [open, setOpen] = useState<MenuKey>(null);
  const [viewSub, setViewSub] = useState<ViewSubmenu>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const router = useRouter();
  const user = useStudioStore((state) => state.user);
  const newBoard = useStudioStore((state) => state.newBoard);
  const cloneBoard = useStudioStore((state) => state.cloneBoard);
  const closeBoard = useStudioStore((state) => state.closeBoard);
  const exportActivePgn = useStudioStore((state) => state.exportActivePgn);
  const openPgnSource = useStudioStore((state) => state.openPgnSource);
  const undo = useStudioStore((state) => state.undo);
  const redo = useStudioStore((state) => state.redo);
  const pruneAfter = useStudioStore((state) => state.pruneAfter);
  const promoteVariation = useStudioStore((state) => state.promoteVariation);
  const makeMainline = useStudioStore((state) => state.makeMainline);
  const deleteVariation = useStudioStore((state) => state.deleteVariation);
  const setNotationEditor = useStudioStore((state) => state.setNotationEditor);
  const flip = useStudioStore((state) => state.flip);
  const toggleCoordinates = useStudioStore((state) => state.toggleCoordinates);
  const toggleEvalBar = useStudioStore((state) => state.toggleEvalBar);
  const toggleGamePreview = useStudioStore((state) => state.toggleGamePreview);
  const moveSound = useStudioStore((state) => state.settings.moveSound);
  const toggleMoveSound = useStudioStore((state) => state.toggleMoveSound);
  const showCoordinates = useStudioStore((state) => state.settings.showCoordinates);
  const showEvalBar = useStudioStore((state) => state.settings.showEvalBar);
  const gamePreviewEnabled = useStudioStore((state) => state.settings.gamePreviewEnabled);
  const setBoardTheme = useStudioStore((state) => state.setBoardTheme);
  const boardTheme = useStudioStore((state) => state.settings.boardTheme);
  const setPieceSet = useStudioStore((state) => state.setPieceSet);
  const pieceSet = useStudioStore((state) => state.settings.pieceSet);
  const setMoveNotation = useStudioStore((state) => state.setMoveNotation);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const setColorScheme = useStudioStore((state) => state.setColorScheme);
  const colorScheme = useStudioStore((state) => state.settings.colorScheme);
  const insertNullMove = useStudioStore((state) => state.insertNullMove);
  const clearBoardMarks = useStudioStore((state) => state.clearBoardMarks);
  const setupMode = useStudioStore((state) => state.setupMode);
  const setAboutOpen = useStudioStore((state) => state.setAboutOpen);
  const setStatus = useStudioStore((state) => state.setStatus);
  const toStart = useStudioStore((state) => state.toStart);
  const toEnd = useStudioStore((state) => state.toEnd);
  const active = useStudioStore((state) => {
    return state.boards.find((item) => item.id === state.activeBoardId) ?? state.boards[0];
  });

  function close() {
    setOpen(null);
    setViewSub(null);
  }

  async function copyPgn() {
    await navigator.clipboard.writeText(exportActivePgn());
    setStatus("PGN copied to clipboard");
    close();
  }

  async function copyFen() {
    try {
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
    setShareCopied(false);
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
  }

  async function copyShareUrl() {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
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

  return (
    <div className="relative z-30 flex h-9 items-center gap-1 border-b border-studio-border bg-studio-chrome px-2 text-[13px] text-studio-fg">
      <span className="mr-3 px-2 font-semibold tracking-tight text-studio-fg">
        Xadrez <span className="text-[10px] font-normal text-sky-400">Digital</span>
      </span>
      {(
        [
          ["file", "File"],
          ["edit", "Edit"],
          ["view", "View"],
          ["help", "Help"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          className={`rounded px-2 py-1 hover:bg-studio-hover ${open === key ? "bg-studio-hover" : ""}`}
          onClick={() => {
            setViewSub(null);
            setOpen(open === key ? null : key);
          }}
          onMouseEnter={() => {
            if (key !== "view") {
              setViewSub(null);
            }
          }}
        >
          {label}
        </button>
      ))}
      <div className="ml-auto pr-2 text-[12px] text-studio-faint">
        {user?.email ? (
          <button className="hover:text-studio-fg" onClick={() => void createBrowserSupabase()?.auth.signOut()}>
            {user.email}
          </button>
        ) : (
          <button className="hover:text-studio-fg" onClick={() => router.push("/login")}>
            Sign in
          </button>
        )}
      </div>

      {open ? (
        <button className="absolute inset-0 z-10 cursor-default" onClick={close} aria-label="Close menu" />
      ) : null}

      {open === "file" ? (
        <div className="absolute left-20 top-9 z-20 w-64 rounded border border-studio-border bg-studio-elevated py-1 shadow-2xl">
          <Item label="New empty board" onClick={() => { newBoard(); close(); }} />
          <Item label="Open PGN" shortcut="Ctrl+O" onClick={() => { onOpenPgn(); close(); }} />
          <Item label="Open from clipboard" onClick={() => void openClipboard()} />
          <Divider />
          <Item label="Save" shortcut="Ctrl+S" onClick={() => void saveBoard()} />
          <Item label="Save As…" shortcut="Ctrl+Shift+S" onClick={() => downloadPgn(`${active.title}.pgn`)} />
          <Item label="Export PGN" onClick={() => downloadPgn(`${active.title}.pgn`)} />
          <Item label="Copy PGN to clipboard" onClick={() => void copyPgn()} />
          <Item label="Copy FEN" onClick={() => void copyFen()} />
          <Item label="Share board" onClick={() => void shareBoard()} />
          <Item label="Copy board image" onClick={() => void copyBoardImage()} />
          <Item label="Print" shortcut="Ctrl+P" onClick={() => void printBoard()} />
          <Divider />
          <Item label="Clone board" onClick={() => { cloneBoard(); close(); }} />
          <Item label="Close board" shortcut="Ctrl+Q" onClick={() => { closeBoard(); close(); }} />
        </div>
      ) : null}

      {open === "edit" ? (
        <div className="absolute left-28 top-9 z-20 w-64 rounded border border-studio-border bg-studio-elevated py-1 shadow-2xl">
          <Item label="Undo" shortcut="Ctrl+Z" onClick={() => { undo(); close(); }} />
          <Item label="Redo" shortcut="Ctrl+Y" onClick={() => { redo(); close(); }} />
          <Divider />
          <Item
            label="Setup Board"
            onClick={() => {
              useStudioStore.getState().setSetupMode(true);
              close();
            }}
          />
          <Item
            label="Game information"
            onClick={() => { setNotationEditor("headers"); close(); }}
          />
          <Item
            label="Promote variation"
            shortcut="Ctrl+↑"
            onClick={() => { promoteVariation(); close(); }}
          />
          <Item
            label="Make mainline"
            shortcut="Ctrl+Shift+↑"
            onClick={() => { makeMainline(); close(); }}
          />
          <Item
            label="Delete variation"
            shortcut="Ctrl+Del"
            onClick={() => { deleteVariation(); close(); }}
          />
          <Item
            label="Text after move"
            shortcut="Ctrl+A"
            onClick={() => { setNotationEditor("comment"); close(); }}
          />
          <Item
            label="Text before move"
            shortcut="Ctrl+Shift+A"
            disabled={active.path.length === 0}
            onClick={() => { setNotationEditor("commentBefore"); close(); }}
          />
          <Item
            label="Insert null move"
            disabled={setupMode}
            onClick={() => { insertNullMove(); close(); }}
          />
          <Item label="Delete After" shortcut="Del" onClick={() => { pruneAfter(); close(); }} />
          <Item
            label="Clear arrows & highlights"
            disabled={marksAreEmpty(getMarksAt(active.tree, active.path))}
            onClick={() => { clearBoardMarks(); close(); }}
          />
          <Divider />
          <Item label="Goto start" onClick={() => { toStart(); close(); }} />
          <Item label="Goto end" onClick={() => { toEnd(); close(); }} />
        </div>
      ) : null}

      {open === "view" ? (
        <div className="absolute left-40 top-9 z-20 w-64 rounded border border-studio-border bg-studio-elevated py-1 shadow-2xl">
          <Item label="Flip Board" shortcut="Ctrl+F" onMouseEnter={() => setViewSub(null)} onClick={() => { flip(); close(); }} />
          <Item
            label={showCoordinates ? "✓ Show Coordinates" : "Show Coordinates"}
            onMouseEnter={() => setViewSub(null)}
            onClick={() => { toggleCoordinates(); close(); }}
          />
          <Item
            label={showEvalBar ? "✓ Show Evaluation Bar" : "Show Evaluation Bar"}
            onMouseEnter={() => setViewSub(null)}
            onClick={() => { toggleEvalBar(); close(); }}
          />
          <Item
            label={gamePreviewEnabled ? "✓ Game Preview Mode" : "Game Preview Mode"}
            onMouseEnter={() => setViewSub(null)}
            onClick={() => { toggleGamePreview(); close(); }}
          />
          <Item
            label={moveSound ? "✓ Move Sound" : "Move Sound"}
            onMouseEnter={() => setViewSub(null)}
            onClick={() => { toggleMoveSound(); close(); }}
          />
          <Divider />
          <div className="relative">
            <Item
              label="Open Panel"
              submenu
              onMouseEnter={() => setViewSub("panel")}
              onClick={() => setViewSub("panel")}
            />
            {viewSub === "panel" ? (
              <div className="absolute left-full top-0 z-30 ml-px w-52 rounded border border-studio-border bg-studio-elevated py-1 shadow-2xl">
                {OPEN_PANEL_ITEMS.map((item) => (
                  <Item
                    key={item.id}
                    label={item.label}
                    onClick={() => {
                      openStudioPanel(item.id);
                      close();
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative">
            <Item
              label="Board Theme"
              submenu
              onMouseEnter={() => setViewSub("theme")}
              onClick={() => setViewSub("theme")}
            />
            {viewSub === "theme" ? (
              <div className="absolute left-full top-0 z-30 ml-px max-h-80 w-52 overflow-auto rounded border border-studio-border bg-studio-elevated py-1 shadow-2xl">
                {BOARD_THEME_IDS.map((id) => (
                  <Item
                    key={id}
                    label={BOARD_THEMES[id].label}
                    checked={boardTheme === id}
                    onClick={() => {
                      setBoardTheme(id);
                      close();
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative">
            <Item
              label="Piece Set"
              submenu
              onMouseEnter={() => setViewSub("pieces")}
              onClick={() => setViewSub("pieces")}
            />
            {viewSub === "pieces" ? (
              <div className="absolute left-full top-0 z-30 ml-px max-h-80 w-52 overflow-auto rounded border border-studio-border bg-studio-elevated py-1 shadow-2xl">
                {PIECE_SET_IDS.map((id) => (
                  <Item
                    key={id}
                    label={PIECE_SETS[id].label}
                    checked={pieceSet === id}
                    onClick={() => {
                      setPieceSet(id);
                      close();
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative">
            <Item
              label="Color Scheme"
              submenu
              onMouseEnter={() => setViewSub("scheme")}
              onClick={() => setViewSub("scheme")}
            />
            {viewSub === "scheme" ? (
              <div className="absolute left-full top-0 z-30 ml-px w-52 overflow-auto rounded border border-studio-border bg-studio-elevated py-1 shadow-2xl">
                {COLOR_SCHEME_IDS.map((id) => (
                  <Item
                    key={id}
                    label={COLOR_SCHEMES[id].label}
                    checked={colorScheme === id}
                    onClick={() => {
                      setColorScheme(id);
                      close();
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative">
            <Item
              label="Move Notation"
              submenu
              onMouseEnter={() => setViewSub("notation")}
              onClick={() => setViewSub("notation")}
            />
            {viewSub === "notation" ? (
              <div className="absolute left-full top-0 z-30 ml-px w-52 overflow-auto rounded border border-studio-border bg-studio-elevated py-1 shadow-2xl">
                {MOVE_NOTATION_IDS.map((id) => (
                  <Item
                    key={id}
                    label={MOVE_NOTATIONS[id].label}
                    checked={moveNotation === id}
                    onClick={() => {
                      setMoveNotation(id);
                      close();
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <Item label="Reset View" onMouseEnter={() => setViewSub(null)} onClick={() => { useStudioStore.getState().resetView(); close(); }} />
        </div>
      ) : null}

      {open === "help" ? (
        <div className="absolute left-52 top-9 z-20 w-64 rounded border border-studio-border bg-studio-elevated py-1 shadow-2xl">
          <Item label="About Xadrez Digital" onClick={() => { setAboutOpen(true); close(); }} />
        </div>
      ) : null}
      {shareUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShareUrl(null)}
        >
          <div
            className="w-[32rem] max-w-[calc(100%-2rem)] rounded-lg border border-studio-border bg-studio-elevated p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-medium text-studio-fg">Share board</h2>
            <p className="mt-2 text-sm text-studio-muted">
              Anyone with this link opens this position.
            </p>
            <a
              href={shareUrl}
              className="mt-3 block break-all rounded border border-studio-border bg-studio-bg px-2 py-1.5 text-[13px] text-sky-400 underline"
            >
              {shareUrl}
            </a>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="rounded bg-studio-accent px-3 py-1.5 text-sm text-white"
                onClick={() => void copyShareUrl()}
              >
                {shareCopied ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                className="rounded px-3 py-1.5 text-sm text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
                onClick={() => setShareUrl(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
