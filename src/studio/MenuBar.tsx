"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Copy, Link2 } from "lucide-react";
import { signOut } from "@/app/login/actions";
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
import { SITE_NAME, SITE_SECTIONS } from "@/src/site/sections";
import { OPEN_PANEL_ITEMS, openStudioPanel } from "./dock-api";
import { MenuDivider as Divider, MenuItem as Item, MenuSurface } from "./ui/Menu";
import { BrandLockup } from "./ui/BrandLockup";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { SettingsDialog } from "./SettingsDialog";

type MenuKey = "file" | "edit" | "view" | "help" | "account" | null;
type ViewSubmenu = "theme" | "pieces" | "notation" | "panel" | "scheme" | null;

const TOP_MENUS = [
  ["file", "File"],
  ["edit", "Edit"],
  ["view", "View"],
  ["help", "Help"],
] as const;

function ThemeSwatch({ light, dark }: { light: string; dark: string }) {
  return (
    <span className="inline-flex h-3 w-[22px] shrink-0 overflow-hidden rounded-[3px] outline outline-1 outline-studio-border">
      <i className="flex-1" style={{ backgroundColor: light }} />
      <i className="flex-1" style={{ backgroundColor: dark }} />
    </span>
  );
}

function Submenu({
  open,
  label,
  onOpen,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  onOpen: () => void;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <Item label={label} submenu highlighted={open} onMouseEnter={onOpen} onClick={onOpen} />
      {open ? (
        <MenuSurface className="absolute left-full top-[-5px] ml-1.5 max-h-80 min-w-52 overflow-auto" onClose={onClose}>
          {children}
        </MenuSurface>
      ) : null}
    </div>
  );
}

function initials(email: string): string {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  return letters.toUpperCase() || "?";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const router = useRouter();
  const setActivity = useStudioStore((state) => state.setActivity);
  const boardCount = useStudioStore((state) => state.boards.length);
  const dirtyCount = useStudioStore((state) => state.boards.filter((board) => board.dirty).length);
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

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(null);
      setViewSub(null);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

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

  function toggleMenu(key: Exclude<MenuKey, null>) {
    setViewSub(null);
    setOpen(open === key ? null : key);
  }

  function run(action: () => void) {
    return () => {
      action();
      close();
    };
  }

  const leaveSubmenu = () => setViewSub(null);

  function menuContent(key: (typeof TOP_MENUS)[number][0]) {
    if (key === "file") {
      return (
        <>
          <Item label="New empty board" shortcut="Ctrl+N" onClick={run(newBoard)} />
          <Item label="Open PGN…" shortcut="Ctrl+O" onClick={run(onOpenPgn)} />
          <Item label="Open from clipboard" onClick={() => void openClipboard()} />
          <Divider />
          <Item label="Save" shortcut="Ctrl+S" onClick={() => void saveBoard()} />
          <Item label="Save as…" shortcut="Ctrl+Shift+S" onClick={() => downloadPgn(`${active.title}.pgn`)} />
          <Item label="Export PGN" onClick={() => downloadPgn(`${active.title}.pgn`)} />
          <Divider />
          <Item label="Copy PGN" onClick={() => void copyPgn()} />
          <Item label="Copy FEN" onClick={() => void copyFen()} />
          <Item label="Copy board image" onClick={() => void copyBoardImage()} />
          <Item label="Share board…" onClick={() => void shareBoard()} />
          <Item label="Print" shortcut="Ctrl+P" onClick={() => void printBoard()} />
          <Divider />
          <Item label="Clone board" onClick={run(cloneBoard)} />
          <Item label="Close board" shortcut="Ctrl+Q" onClick={run(closeBoard)} />
        </>
      );
    }
    if (key === "edit") {
      return (
        <>
          <Item label="Undo" shortcut="Ctrl+Z" onClick={run(undo)} />
          <Item label="Redo" shortcut="Ctrl+Y" onClick={run(redo)} />
          <Divider />
          <Item label="Setup board" onClick={run(() => useStudioStore.getState().setSetupMode(true))} />
          <Item label="Game information" onClick={run(() => setNotationEditor("headers"))} />
          <Divider />
          <Item label="Promote variation" shortcut="Ctrl+↑" onClick={run(promoteVariation)} />
          <Item label="Make mainline" shortcut="Ctrl+Shift+↑" onClick={run(makeMainline)} />
          <Item label="Delete variation" shortcut="Ctrl+Del" onClick={run(deleteVariation)} />
          <Item label="Delete after" shortcut="Del" onClick={run(pruneAfter)} />
          <Divider />
          <Item label="Text after move" shortcut="Ctrl+A" onClick={run(() => setNotationEditor("comment"))} />
          <Item
            label="Text before move"
            shortcut="Ctrl+Shift+A"
            disabled={active.path.length === 0}
            disabledReason="At start"
            onClick={run(() => setNotationEditor("commentBefore"))}
          />
          <Item
            label="Insert null move"
            disabled={setupMode}
            disabledReason="In setup mode"
            onClick={run(insertNullMove)}
          />
          <Item
            label="Clear arrows & highlights"
            disabled={marksAreEmpty(getMarksAt(active.tree, active.path))}
            disabledReason="No marks"
            onClick={run(clearBoardMarks)}
          />
          <Divider />
          <Item label="Go to start" shortcut="Home" onClick={run(toStart)} />
          <Item label="Go to end" shortcut="End" onClick={run(toEnd)} />
        </>
      );
    }
    if (key === "view") {
      return (
        <>
          <Item label="Flip board" shortcut="Ctrl+F" onMouseEnter={leaveSubmenu} onClick={run(flip)} />
          <Divider />
          <Item label="Show coordinates" checked={showCoordinates} onMouseEnter={leaveSubmenu} onClick={run(toggleCoordinates)} />
          <Item label="Show evaluation bar" checked={showEvalBar} onMouseEnter={leaveSubmenu} onClick={run(toggleEvalBar)} />
          <Item label="Game preview mode" checked={gamePreviewEnabled} onMouseEnter={leaveSubmenu} onClick={run(toggleGamePreview)} />
          <Item label="Move sound" checked={moveSound} onMouseEnter={leaveSubmenu} onClick={run(toggleMoveSound)} />
          <Divider />
          <Submenu label="Open panel" open={viewSub === "panel"} onOpen={() => setViewSub("panel")} onClose={leaveSubmenu}>
            {OPEN_PANEL_ITEMS.map((item) => (
              <Item key={item.id} label={item.label} onClick={run(() => openStudioPanel(item.id))} />
            ))}
          </Submenu>
          <Submenu label="Board theme" open={viewSub === "theme"} onOpen={() => setViewSub("theme")} onClose={leaveSubmenu}>
            {BOARD_THEME_IDS.map((id) => (
              <Item
                key={id}
                label={BOARD_THEMES[id].label}
                leading={<ThemeSwatch light={BOARD_THEMES[id].light} dark={BOARD_THEMES[id].dark} />}
                checked={boardTheme === id}
                onClick={run(() => setBoardTheme(id))}
              />
            ))}
          </Submenu>
          <Submenu label="Piece set" open={viewSub === "pieces"} onOpen={() => setViewSub("pieces")} onClose={leaveSubmenu}>
            {PIECE_SET_IDS.map((id) => (
              <Item key={id} label={PIECE_SETS[id].label} checked={pieceSet === id} onClick={run(() => setPieceSet(id))} />
            ))}
          </Submenu>
          <Submenu label="Color scheme" open={viewSub === "scheme"} onOpen={() => setViewSub("scheme")} onClose={leaveSubmenu}>
            {COLOR_SCHEME_IDS.map((id) => (
              <Item
                key={id}
                label={COLOR_SCHEMES[id].label}
                checked={colorScheme === id}
                onClick={run(() => setColorScheme(id))}
              />
            ))}
          </Submenu>
          <Submenu label="Move notation" open={viewSub === "notation"} onOpen={() => setViewSub("notation")} onClose={leaveSubmenu}>
            {MOVE_NOTATION_IDS.map((id) => (
              <Item
                key={id}
                label={MOVE_NOTATIONS[id].label}
                checked={moveNotation === id}
                onClick={run(() => setMoveNotation(id))}
              />
            ))}
          </Submenu>
          <Divider />
          <Item label="Settings…" onMouseEnter={leaveSubmenu} onClick={run(() => setSettingsOpen(true))} />
          <Item
            label="Reset view"
            onMouseEnter={leaveSubmenu}
            onClick={run(() => useStudioStore.getState().resetView())}
          />
        </>
      );
    }
    return <Item label={`About ${SITE_NAME}`} onClick={run(() => setAboutOpen(true))} />;
  }

  return (
    <div className="relative z-30 flex h-9 items-center gap-0.5 border-b border-studio-border bg-studio-chrome px-2 text-body text-studio-fg">
      <span className="mr-3 px-1.5">
        <BrandLockup />
      </span>
      {SITE_SECTIONS.filter((section) => section.href !== "/studio").map((section) => (
        <a
          key={section.href}
          href={section.href}
          className="relative z-20 mr-1 rounded-md px-2 py-0.5 text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
        >
          {section.label}
        </a>
      ))}

      {open ? (
        <button className="fixed inset-0 z-10 cursor-default" onClick={close} aria-label="Close menu" />
      ) : null}

      {TOP_MENUS.map(([key, label]) => (
        <div key={key} className="relative z-20">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open === key}
            className={`h-[26px] rounded-md px-2.5 ${
              open === key
                ? "bg-studio-hover-strong text-studio-fg"
                : "text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
            }`}
            onClick={() => toggleMenu(key)}
            onMouseEnter={() => {
              if (open && open !== key && open !== "account") {
                setViewSub(null);
                setOpen(key);
              }
            }}
          >
            {label}
          </button>
          {open === key ? (
            <MenuSurface className="absolute left-0 top-[calc(100%+5px)]" onClose={close}>
              {menuContent(key)}
            </MenuSurface>
          ) : null}
        </div>
      ))}

      <div className="relative z-20 ml-auto">
        {user?.email ? (
          <>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={open === "account"}
              onClick={() => toggleMenu("account")}
              className={`inline-flex h-[26px] items-center gap-2 rounded-full border border-studio-border pl-[3px] pr-2 text-dense ${
                open === "account" ? "bg-studio-hover text-studio-fg" : "text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
              }`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-studio-accent-soft text-[10px] font-bold text-studio-accent-text">
                {initials(user.email)}
              </span>
              <span className="max-w-40 truncate">{user.email}</span>
              <ChevronDown size={13} />
            </button>
            {open === "account" ? (
              <MenuSurface className="absolute right-0 top-[calc(100%+5px)] min-w-60" onClose={close}>
                <div className="px-2 pb-1.5 pt-2">
                  <div className="truncate font-medium text-studio-fg">{user.email}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-caption text-studio-faint">
                    <span className={`h-1.5 w-1.5 rounded-full ${dirtyCount ? "bg-studio-warning-fg" : "bg-studio-success"}`} />
                    {dirtyCount
                      ? `${dirtyCount} board${dirtyCount === 1 ? "" : "s"} waiting to sync`
                      : "All boards synced"}
                  </div>
                </div>
                <Divider />
                <Item label="My boards" shortcut={String(boardCount)} onClick={run(() => setActivity("boards"))} />
                <Item label="Settings…" onClick={run(() => setSettingsOpen(true))} />
                <Divider />
                <Item
                  label="Sign out"
                  danger
                  onClick={run(() => {
                    void (async () => {
                      await createBrowserSupabase()?.auth.signOut();
                      await signOut();
                    })();
                  })}
                />
              </MenuSurface>
            ) : null}
          </>
        ) : (
          <Button size="sm" variant="ghost" className="border border-studio-border" onClick={() => router.push("/login")}>
            Sign in
          </Button>
        )}
      </div>

      {shareUrl ? (
        <Dialog
          title="Share board"
          onClose={() => setShareUrl(null)}
          footer={<Button onClick={() => setShareUrl(null)}>Done</Button>}
        >
          <p className="mb-3">Anyone with this link opens this position in a new board.</p>
          <div className="flex h-[34px] items-center gap-2 rounded-lg border border-studio-border-strong bg-studio-panel pl-2.5 pr-1 text-studio-faint">
            <Link2 size={14} className="shrink-0" />
            <input
              readOnly
              value={shareUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent text-dense text-studio-fg outline-none"
            />
            <Button size="sm" variant="primary" className="h-[26px]" onClick={() => void copyShareUrl()}>
              {shareCopied ? <Check size={13} /> : <Copy size={13} />}
              {shareCopied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </Dialog>
      ) : null}
      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
