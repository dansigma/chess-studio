"use client";

import type { ReactNode } from "react";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { BOARD_THEME_IDS, BOARD_THEMES } from "@/src/chess/board-themes";
import { PIECE_SET_IDS, PIECE_SETS } from "@/src/chess/piece-sets";
import { MOVE_NOTATION_IDS, MOVE_NOTATIONS } from "@/src/chess/move-notation";
import { COLOR_SCHEME_IDS, COLOR_SCHEMES } from "@/src/studio/color-scheme";
import { OPEN_PANEL_ITEMS, openBoardPanel, openExplorerPanel, openStudioPanel } from "./dock-api";
import { MenuDivider as Divider, MenuItem as Item, MenuSurface } from "./ui/Menu";
import { tStudioChrome, type StudioChromeStringKey } from "@/src/i18n/studio-chrome-strings";

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

// SIG-857: view-menu subscriptions live here so MenuBar root stays static.
// Primitives only; theme/piece/notation/scheme ids re-render only their own
// submenu rows.
// SIG-1109: factored into ViewMenuItems so the mobile bottom sheet reuses the
// same actions with `flat` submenus (no hover submenus on touch) and optional
// dock openers. The exported component keeps the desktop menu contract
// unchanged.
export function ViewMenuItems({
  viewSub,
  setViewSub,
  leaveSubmenu,
  onOpenSettings,
  run,
  flat = false,
  showPanels = true,
}: {
  viewSub: "theme" | "pieces" | "notation" | "panel" | "scheme" | null;
  setViewSub: (sub: "theme" | "pieces" | "notation" | "panel" | "scheme" | null) => void;
  leaveSubmenu: () => void;
  onOpenSettings: () => void;
  run: (action: () => void) => () => void;
  flat?: boolean;
  showPanels?: boolean;
}) {
  const flip = useStudioStore((state) => state.flip);
  const locale = useStudioStore((state) => state.settings.locale);
  const showCoordinates = useStudioStore((state) => state.settings.showCoordinates);
  const showEvalBar = useStudioStore((state) => state.settings.showEvalBar);
  const gamePreviewEnabled = useStudioStore((state) => state.settings.gamePreviewEnabled);
  const moveSound = useStudioStore((state) => state.settings.moveSound);
  const boardTheme = useStudioStore((state) => state.settings.boardTheme);
  const pieceSet = useStudioStore((state) => state.settings.pieceSet);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const notationDensity = useStudioStore((state) => state.settings.notationDensity);
  const colorScheme = useStudioStore((state) => state.settings.colorScheme);
  const toggleCoordinates = useStudioStore((state) => state.toggleCoordinates);
  const toggleEvalBar = useStudioStore((state) => state.toggleEvalBar);
  const toggleGamePreview = useStudioStore((state) => state.toggleGamePreview);
  const toggleMoveSound = useStudioStore((state) => state.toggleMoveSound);
  const toggleNotationDensity = useStudioStore((state) => state.toggleNotationDensity);
  const setBoardTheme = useStudioStore((state) => state.setBoardTheme);
  const setPieceSet = useStudioStore((state) => state.setPieceSet);
  const setMoveNotation = useStudioStore((state) => state.setMoveNotation);
  const setColorScheme = useStudioStore((state) => state.setColorScheme);

  return (
    <>
      <Item label={tStudioChrome(locale, "chrome.view.flip")} shortcut="Ctrl+F" onMouseEnter={leaveSubmenu} onClick={run(flip)} />
      <Divider />
      <Item label={tStudioChrome(locale, "chrome.view.showCoordinates")} checked={showCoordinates} onMouseEnter={leaveSubmenu} onClick={run(toggleCoordinates)} />
      <Item label={tStudioChrome(locale, "chrome.view.showEvalBar")} checked={showEvalBar} onMouseEnter={leaveSubmenu} onClick={run(toggleEvalBar)} />
      <Item label={tStudioChrome(locale, "chrome.view.gamePreview")} checked={gamePreviewEnabled} onMouseEnter={leaveSubmenu} onClick={run(toggleGamePreview)} />
      <Item label={tStudioChrome(locale, "chrome.view.moveSound")} checked={moveSound} onMouseEnter={leaveSubmenu} onClick={run(toggleMoveSound)} />
      <Item
        label={tStudioChrome(locale, "chrome.view.compactNotation")}
        checked={notationDensity === "compact"}
        onMouseEnter={leaveSubmenu}
        onClick={run(toggleNotationDensity)}
      />
      <Divider />
      {showPanels ? (
        flat ? (
          <>
            <Item
              label={tStudioChrome(locale, "chrome.view.explorer")}
              onClick={run(() => openExplorerPanel())}
            />
            {OPEN_PANEL_ITEMS.filter((item) => item.id !== "explorer").map((item) => (
              <Item key={item.id} label={tStudioChrome(locale, `chrome.view.panel.${item.id}` as StudioChromeStringKey)} onClick={run(() => openStudioPanel(item.id))} />
            ))}
            <Divider />
          </>
        ) : (
          <Submenu label={tStudioChrome(locale, "chrome.view.openPanel")} open={viewSub === "panel"} onOpen={() => setViewSub("panel")} onClose={leaveSubmenu}>
            <Item
              label={tStudioChrome(locale, "chrome.view.board")}
              onClick={run(() => {
                const active = selectActiveBoard(useStudioStore.getState());
                openBoardPanel(active.id, active.title);
              })}
            />
            {/* SIG-908: a second explorer opens side by side with its own source
                (seeded from the sidebar-driven global source); the bare panel stays
                for the default single-explorer flow. */}
            <Item label={tStudioChrome(locale, "chrome.view.explorer")} onClick={run(() => openExplorerPanel())} />
            {OPEN_PANEL_ITEMS.filter((item) => item.id !== "explorer").map((item) => (
              <Item key={item.id} label={tStudioChrome(locale, `chrome.view.panel.${item.id}` as StudioChromeStringKey)} onClick={run(() => openStudioPanel(item.id))} />
            ))}
          </Submenu>
        )
      ) : null}
      {flat ? (
        <>
          <Divider />
          {BOARD_THEME_IDS.map((id) => (
            <Item
              key={id}
              label={`${tStudioChrome(locale, "chrome.view.boardTheme")}: ${BOARD_THEMES[id].label}`}
              leading={<ThemeSwatch light={BOARD_THEMES[id].light} dark={BOARD_THEMES[id].dark} />}
              checked={boardTheme === id}
              onClick={run(() => setBoardTheme(id))}
            />
          ))}
          <Divider />
          {PIECE_SET_IDS.map((id) => (
            <Item key={id} label={`${tStudioChrome(locale, "chrome.view.pieceSet")}: ${PIECE_SETS[id].label}`} checked={pieceSet === id} onClick={run(() => setPieceSet(id))} />
          ))}
          <Divider />
          {COLOR_SCHEME_IDS.map((id) => (
            <Item
              key={id}
              label={`${tStudioChrome(locale, "chrome.view.colorScheme")}: ${COLOR_SCHEMES[id].label}`}
              checked={colorScheme === id}
              onClick={run(() => setColorScheme(id))}
            />
          ))}
          <Divider />
          {MOVE_NOTATION_IDS.map((id) => (
            <Item
              key={id}
              label={`${tStudioChrome(locale, "chrome.view.moveNotation")}: ${MOVE_NOTATIONS[id].label}`}
              checked={moveNotation === id}
              onClick={run(() => setMoveNotation(id))}
            />
          ))}
        </>
      ) : (
        <>
          <Submenu label={tStudioChrome(locale, "chrome.view.boardTheme")} open={viewSub === "theme"} onOpen={() => setViewSub("theme")} onClose={leaveSubmenu}>
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
          <Submenu label={tStudioChrome(locale, "chrome.view.pieceSet")} open={viewSub === "pieces"} onOpen={() => setViewSub("pieces")} onClose={leaveSubmenu}>
            {PIECE_SET_IDS.map((id) => (
              <Item key={id} label={PIECE_SETS[id].label} checked={pieceSet === id} onClick={run(() => setPieceSet(id))} />
            ))}
          </Submenu>
          <Submenu label={tStudioChrome(locale, "chrome.view.colorScheme")} open={viewSub === "scheme"} onOpen={() => setViewSub("scheme")} onClose={leaveSubmenu}>
            {COLOR_SCHEME_IDS.map((id) => (
              <Item
                key={id}
                label={COLOR_SCHEMES[id].label}
                checked={colorScheme === id}
                onClick={run(() => setColorScheme(id))}
              />
            ))}
          </Submenu>
          <Submenu label={tStudioChrome(locale, "chrome.view.moveNotation")} open={viewSub === "notation"} onOpen={() => setViewSub("notation")} onClose={leaveSubmenu}>
            {MOVE_NOTATION_IDS.map((id) => (
              <Item
                key={id}
                label={MOVE_NOTATIONS[id].label}
                checked={moveNotation === id}
                onClick={run(() => setMoveNotation(id))}
              />
            ))}
          </Submenu>
        </>
      )}
      <Divider />
      <Item label={tStudioChrome(locale, "chrome.view.settings")} onMouseEnter={flat ? undefined : leaveSubmenu} onClick={run(onOpenSettings)} />
      <Item
        label={tStudioChrome(locale, "chrome.view.resetView")}
        onMouseEnter={flat ? undefined : leaveSubmenu}
        onClick={run(() => useStudioStore.getState().resetView())}
      />
    </>
  );
}

export function MenuBarViewMenu({
  viewSub,
  setViewSub,
  leaveSubmenu,
  onOpenSettings,
  run,
}: {
  viewSub: "theme" | "pieces" | "notation" | "panel" | "scheme" | null;
  setViewSub: (sub: "theme" | "pieces" | "notation" | "panel" | "scheme" | null) => void;
  leaveSubmenu: () => void;
  onOpenSettings: () => void;
  run: (action: () => void) => () => void;
}) {
  return (
    <ViewMenuItems
      viewSub={viewSub}
      setViewSub={setViewSub}
      leaveSubmenu={leaveSubmenu}
      onOpenSettings={onOpenSettings}
      run={run}
    />
  );
}
