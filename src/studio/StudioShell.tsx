"use client";

import { useEffect, useRef } from "react";
import { ActivityBar } from "./ActivityBar";
import { BoardsSidebar } from "./BoardsSidebar";
import { DatabasesSidebar } from "./DatabasesSidebar";
import { MenuBar } from "./MenuBar";
import { FilesSidebar } from "./FilesSidebar";
import { SearchSidebar } from "./SearchSidebar";
import { BookmarksSidebar } from "./BookmarksSidebar";
import { StudioDock } from "./StudioDock";
import { openBoardPanel, openStudioPanel } from "./dock-api";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { importPgn } from "@/src/chess/pgn";
import { useExplorerData } from "./use-explorer-data";
import {
  forgetRemoteDockSync,
  loadRemoteSettings,
  persistBoard,
  persistSettings,
  syncRemoteDockLayout,
  useStudioStore,
  type BoardSession,
} from "@/src/store/studio-store";
import { loadRemoteFiles } from "@/src/lib/user-files";
import { preparePrintFallback, printActiveBoard } from "./print-board";
import { PRINT_SHEET_ID } from "@/src/chess/print-sheet";
import { fenFromShareSearch } from "@/src/chess/share-board";
import { StatusBar } from "./StatusBar";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { BrandLockup } from "./ui/BrandLockup";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  ) {
    return true;
  }
  return Boolean(target.closest('[role="dialog"]'));
}

export function StudioShell() {
  const fileRef = useRef<HTMLInputElement>(null);
  const sharedFenApplied = useRef(false);
  const activity = useStudioStore((state) => state.activity);
  const source = useStudioStore((state) => state.databaseSource);
  const explorerRetry = useStudioStore((state) => state.explorerRetry);
  // SIG-908: the shell owns the legacy bare `explorer` panel feed — the hook
  // does the fetch and the mirror below keeps the global store fields (read
  // by ExplorerPanel-as-bare + GamesPanel) in sync.
  const legacyExplorer = useExplorerData(source, explorerRetry);
  const status = useStudioStore((state) => state.statusMessage);
  const dirtyRevision = useStudioStore((state) =>
    state.boards.map((board) => `${board.id}:${board.dirty ? "1" : "0"}`).join("|"),
  );
  const aboutOpen = useStudioStore((state) => state.aboutOpen);
  const setAboutOpen = useStudioStore((state) => state.setAboutOpen);
  const setExplorer = useStudioStore((state) => state.setExplorer);
  const setExplorerLoading = useStudioStore((state) => state.setExplorerLoading);
  const setExplorerError = useStudioStore((state) => state.setExplorerError);
  const setUser = useStudioStore((state) => state.setUser);
  const hydrateRemoteBoard = useStudioStore((state) => state.hydrateRemoteBoard);
  const hydrateSettings = useStudioStore((state) => state.hydrateSettings);
  const setBoardsHydrated = useStudioStore((state) => state.setBoardsHydrated);
  // SIG-857: primitive pick — the old `state.settings` object re-rendered on
  // every unrelated field; persistSettings only serializes the full object,
  // so subscribe to its JSON signature instead.
  const settingsSignature = useStudioStore((state) => JSON.stringify(state.settings));
  const sidebarCollapsed = useStudioStore((state) => state.settings.sidebarCollapsed);
  const openPgnSource = useStudioStore((state) => state.openPgnSource);
  const back = useStudioStore((state) => state.back);
  const forward = useStudioStore((state) => state.forward);
  const flip = useStudioStore((state) => state.flip);
  const user = useStudioStore((state) => state.user);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    if (!supabase) {
      return;
    }
    void supabase.auth.getUser().then(({ data }) => {
      const current = data.user;
      setUser(current ? { id: current.id, email: current.email ?? null } : null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const current = session?.user;
      setUser(current ? { id: current.id, email: current.email ?? null } : null);
    });
    return () => data.subscription.unsubscribe();
  }, [setUser]);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    if (!supabase || !user) {
      // SIG-907: guests have nothing to load — mark hydrated immediately so
      // the dock may prune orphan `board:*` panels without waiting.
      setBoardsHydrated();
      return;
    }
    let cancelled = false;
    void (async () => {
      const remoteSettings = await loadRemoteSettings();
      if (cancelled) {
        return;
      }
      if (remoteSettings) {
        hydrateSettings(remoteSettings);
      }
      const { data } = await supabase
        .from("boards")
        .select("*")
        .order("updated_at", { ascending: false });
      if (cancelled) {
        return;
      }
      for (const row of data ?? []) {
        const imported = importPgn(row.pgn);
        // SIG-907: derive the session id from the remote row id so persisted
        // `board:<boardId>` panels resolve to the same session after reload.
        // Session-only boards (remoteId null — guest, new, clone, preview) keep
        // random ids from emptyBoard/newId and their split panels are
        // best-effort: they reseed to the active board on reload.
        const session: BoardSession = {
          id: row.id,
          remoteId: row.id,
          title: row.title,
          tree: imported.tree,
          path: row.current_node_path ?? imported.path,
          headers: imported.headers,
          orientation: row.orientation,
          dirty: false,
          preview: false,
        };
        if (cancelled) {
          return;
        }
        hydrateRemoteBoard(session);
      }
      const remoteFiles = await loadRemoteFiles(user.id);
      if (cancelled) {
        return;
      }
      useStudioStore.getState().mergeRemoteFiles(remoteFiles);
      if (cancelled) {
        return;
      }
      await useStudioStore.getState().hydrateRemoteBookmarks();
      if (cancelled) {
        return;
      }
      // SIG-907: boards query settled — the dock may now prune orphan
      // `board:*` panels whose sessions never arrived.
      setBoardsHydrated();
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateRemoteBoard, hydrateSettings, setBoardsHydrated, user]);

  useEffect(() => {
    if (!user) {
      forgetRemoteDockSync();
      return;
    }
    void syncRemoteDockLayout(user.id);
  }, [user]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void persistSettings(useStudioStore.getState().settings).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [settingsSignature]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const handle = window.setTimeout(() => {
      const board = useStudioStore.getState().active();
      if (!board.dirty) {
        return;
      }
      void persistBoard(board)
        .then((remoteId) => {
          if (remoteId) {
            useStudioStore.getState().markSaved(board.id, remoteId);
          }
        })
        .catch(() => useStudioStore.getState().setStatus("Could not save board."));
    }, 1000);
    return () => window.clearTimeout(handle);
  }, [dirtyRevision, user]);

  useEffect(() => {
    if (status === null) {
      return;
    }
    const handle = window.setTimeout(() => {
      useStudioStore.getState().setStatus(null);
    }, 3000);
    return () => window.clearTimeout(handle);
  }, [status]);

  // SIG-908: legacy feed only — `useExplorerData` owns the fetch above;
  // this mirror keeps the global store fields (bare panel + GamesPanel) in
  // sync without a second network request.
  useEffect(() => {
    setExplorer(legacyExplorer.explorer);
  }, [legacyExplorer.explorer, setExplorer]);

  useEffect(() => {
    setExplorerLoading(legacyExplorer.loading);
  }, [legacyExplorer.loading, setExplorerLoading]);

  useEffect(() => {
    setExplorerError(legacyExplorer.error);
  }, [legacyExplorer.error, setExplorerError]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (document.querySelector("[data-promotion-open]")) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        fileRef.current?.click();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        const board = useStudioStore.getState().active();
        void persistBoard(board).then((remoteId) => {
          if (remoteId) {
            useStudioStore.getState().markSaved(board.id, remoteId);
          }
        });
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        flip();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        // SIG-907: Ctrl+N creates a session, so open its `board:*` panel too.
        useStudioStore.getState().newBoard();
        const active = useStudioStore.getState().active();
        openBoardPanel(active.id, active.title);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        void printActiveBoard();
      }
      const ctrl = event.ctrlKey || event.metaKey;
      const chromeFocus = !isEditableTarget(document.activeElement);
      if (ctrl && event.shiftKey && event.key.toLowerCase() === "a" && chromeFocus) {
        event.preventDefault();
        const board = useStudioStore.getState().active();
        if (board.path.length > 0) {
          useStudioStore.getState().setNotationEditor("commentBefore");
        }
        return;
      }
      if (ctrl && !event.shiftKey && event.key.toLowerCase() === "a" && chromeFocus) {
        event.preventDefault();
        useStudioStore.getState().setNotationEditor("comment");
        return;
      }
      if (ctrl && event.key === "Delete") {
        event.preventDefault();
        useStudioStore.getState().deleteVariation();
        return;
      }
      if (ctrl && event.shiftKey && event.key === "ArrowUp") {
        event.preventDefault();
        useStudioStore.getState().makeMainline();
        return;
      }
      if (ctrl && event.key === "ArrowUp") {
        event.preventDefault();
        useStudioStore.getState().promoteVariation();
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
        useStudioStore.getState().pruneAfter();
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        useStudioStore.getState().toStart();
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        useStudioStore.getState().toEnd();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        forward();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [back, flip, forward]);

  useEffect(() => {
    window.addEventListener("beforeprint", preparePrintFallback);
    return () => window.removeEventListener("beforeprint", preparePrintFallback);
  }, []);

  useEffect(() => {
    if (sharedFenApplied.current) {
      return;
    }
    sharedFenApplied.current = true;
    const fen = fenFromShareSearch(window.location.search);
    if (fen) {
      useStudioStore.getState().openSharedPosition(fen);
    }
  }, []);

  return (
    <>
    <div className="studio-screen flex h-screen flex-col overflow-hidden bg-studio-bg text-studio-fg">
      <MenuBar onOpenPgn={() => fileRef.current?.click()} />
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        <div className="flex min-h-0 min-w-0 flex-1 gap-2 p-2">
          {sidebarCollapsed ? null : activity === "search" ? (
            <SearchSidebar />
          ) : activity === "boards" ? (
            <BoardsSidebar />
          ) : activity === "files" ? (
            <FilesSidebar />
          ) : activity === "bookmarks" ? (
            <BookmarksSidebar />
          ) : (
            <DatabasesSidebar />
          )}
          <div className="min-w-0 flex-1 overflow-hidden">
            <StudioDock />
          </div>
        </div>
      </div>
      <StatusBar message={status} />

      <input
        ref={fileRef}
        type="file"
        accept=".pgn,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          void file.text().then((text) => {
            openPgnSource(file.name.replace(/\.pgn$/i, "") || "PGN", text);
            openStudioPanel("fileGames");
          });
          event.target.value = "";
        }}
      />
      {aboutOpen ? (
        <Dialog
          title={<BrandLockup size="lg" />}
          onClose={() => setAboutOpen(false)}
          footer={
            <Button variant="primary" onClick={() => setAboutOpen(false)}>
              Close
            </Button>
          }
        >
          <p className="mb-3">
            Analysis GUI inspired by ChessMonitor Studio. No ChessMonitor assets or private
            databases are used.
          </p>
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-dense">
            <dt className="text-studio-faint">Engine</dt>
            <dd className="text-studio-fg">Stockfish 19 lite, runs locally</dd>
            <dt className="text-studio-faint">Opening data</dt>
            <dd className="text-studio-fg">Public Lichess explorer</dd>
            <dt className="text-studio-faint">Storage</dt>
            <dd className="text-studio-fg">Boards sync to your account when signed in</dd>
          </dl>
        </Dialog>
      ) : null}
    </div>
    <div id={PRINT_SHEET_ID} />
    </>
  );
}
