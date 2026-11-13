import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { toJson } from "@/src/lib/supabase/database.types";
import {
  clearStoredDockLayout,
  currentDockLayoutEpoch,
  publishDockLayout,
  readStoredDockLayout,
  sanitizeDockLayout,
  writeStoredDockLayout,
  type DockLayoutSnapshot,
} from "@/src/studio/dock-layout";
import {
  readStoredLayouts,
  sanitizeSavedLayouts,
  writeStoredLayouts,
  type SavedDockLayout,
} from "@/src/studio/dock-layouts";
import { exportPgn } from "@/src/chess/pgn";
import { isBoardTheme } from "@/src/chess/board-themes";
import { isPieceSet } from "@/src/chess/piece-sets";
import { isSiteLocale } from "@/src/i18n/locale";
import { SETTINGS_KEY } from "@/src/store/slices/settings";
import type { BoardSession, StudioSettings } from "@/src/store/slices/types";

// SIG-917: store-free remote persistence helpers. Parameterized by explicit
// user id so this module never imports the store (no store<->module cycle).
// The composer's same-name wrappers read the user from the store and call
// these, so all existing consumer imports keep working.

export async function persistBoardRecord(
  board: BoardSession,
  userId: string | null,
): Promise<string | null> {
  const supabase = createBrowserSupabase();
  if (!supabase || !userId) {
    return null;
  }
  if (board.remoteId) {
    const { error } = await supabase
      .from("boards")
      .update({
        title: board.title,
        pgn: exportPgn(board.tree, board.headers),
        current_node_path: board.path,
        orientation: board.orientation,
        repertoire_color: board.repertoireColor,
        updated_at: new Date().toISOString(),
      })
      .eq("id", board.remoteId);
    if (error) {
      throw error;
    }
    return board.remoteId;
  }
  const { data, error } = await supabase
    .from("boards")
    .insert({
      user_id: userId,
      title: board.title,
      pgn: exportPgn(board.tree, board.headers),
      current_node_path: board.path,
      orientation: board.orientation,
      repertoire_color: board.repertoireColor,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  return data.id;
}

// SIG-1199: closing a board never deletes its row. Rows hold the user's only
// copy of the PGN (and the repertoire mark), so closing stamps closed_at and
// the boot merge stops restoring the row into the open-board list.
// The repertoire mark is cleared in the same update: boards_user_repertoire_
// color_uq is unique on (user_id, repertoire_color), so a closed row that kept
// its mark would make every later save of another board marked with that color
// fail. Only open boards are read for the mark, so a closed board's is dead.
export async function markBoardClosedRecord(
  remoteId: string | null,
  userId: string | null,
): Promise<void> {
  const supabase = createBrowserSupabase();
  if (!supabase || !userId || !remoteId) {
    return;
  }
  const { error } = await supabase
    .from("boards")
    .update({ closed_at: new Date().toISOString(), repertoire_color: null })
    .eq("id", remoteId)
    .eq("user_id", userId);
  if (error) {
    throw error;
  }
}

// SIG-1228: last user_settings row known to be on the server per user (written
// by us or read on load). The settings effect fires on every settings change,
// including fields with no user_settings column (sidebar width, explorer
// filters, notation density, ...) and on the post-load hydrate that just echoes
// the remote row, so identical rows are skipped instead of re-upserted.
const lastSyncedSettingsRow = new Map<string, string>();

export function forgetSettingsWriteCache(): void {
  lastSyncedSettingsRow.clear();
}

function settingsRowKey(row: {
  show_coordinates: unknown;
  piece_theme: unknown;
  board_theme: unknown;
  engine_depth: unknown;
  multi_pv: unknown;
  locale: unknown;
}): string {
  return JSON.stringify([
    row.show_coordinates,
    row.piece_theme,
    row.board_theme,
    row.engine_depth,
    row.multi_pv,
    row.locale,
  ]);
}

export async function persistSettingsRecord(
  settings: StudioSettings,
  userId: string | null,
): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
  const supabase = createBrowserSupabase();
  if (!supabase || !userId) {
    return;
  }
  const row = {
    show_coordinates: settings.showCoordinates,
    piece_theme: settings.pieceSet,
    board_theme: settings.boardTheme,
    engine_depth: settings.engineDepth,
    multi_pv: settings.multiPv,
    locale: settings.locale,
  };
  const key = settingsRowKey(row);
  if (lastSyncedSettingsRow.get(userId) === key) {
    return;
  }
  const { error } = await supabase.from("user_settings").upsert({ user_id: userId, ...row });
  if (error) {
    throw error;
  }
  lastSyncedSettingsRow.set(userId, key);
}

export async function loadRemoteSettingsForUser(
  userId: string | null,
): Promise<Partial<StudioSettings> | null> {
  const supabase = createBrowserSupabase();
  if (!supabase || !userId) {
    return null;
  }
  // SIG-919: notationDensity is local-only (no user_settings column), so it
  // rides in the full JSON localStorage record via persistSettingsRecord.
  // Remote select stays on the known columns to avoid PostgREST errors.
  const { data, error } = await supabase
    .from("user_settings")
    .select("show_coordinates, board_theme, piece_theme, engine_depth, multi_pv, locale")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  lastSyncedSettingsRow.set(userId, settingsRowKey(data));
  return {
    showCoordinates: data.show_coordinates,
    boardTheme: isBoardTheme(data.board_theme) ? data.board_theme : undefined,
    pieceSet: isPieceSet(data.piece_theme) ? data.piece_theme : undefined,
    engineDepth: data.engine_depth,
    multiPv: data.multi_pv,
    locale: isSiteLocale(data.locale) ? data.locale : undefined,
  };
}

let syncedDockUserId: string | null = null;

export function forgetRemoteDockSync(): void {
  syncedDockUserId = null;
}

export async function persistDockLayoutRecord(
  snapshot: DockLayoutSnapshot | null,
  epoch: number,
  userId: string | null,
): Promise<void> {
  if (epoch !== currentDockLayoutEpoch()) {
    return;
  }
  if (snapshot) {
    writeStoredDockLayout(snapshot);
  } else {
    clearStoredDockLayout();
  }
  if (epoch !== currentDockLayoutEpoch()) {
    return;
  }
  const supabase = createBrowserSupabase();
  if (!supabase || !userId) {
    return;
  }
  const { error } = await supabase.from("user_settings").upsert({
    user_id: userId,
    layout: toJson(snapshot),
  });
  if (error) {
    throw error;
  }
}

export async function syncRemoteDockLayout(userId: string): Promise<void> {
  if (syncedDockUserId === userId) {
    return;
  }
  syncedDockUserId = userId;
  const epoch = currentDockLayoutEpoch();
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return;
  }
  const { data, error } = await supabase
    .from("user_settings")
    .select("layout")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || epoch !== currentDockLayoutEpoch()) {
    return;
  }
  const remote = sanitizeDockLayout(data?.layout ?? null);
  if (remote) {
    writeStoredDockLayout(remote);
    publishDockLayout(remote);
    return;
  }
  const local = readStoredDockLayout();
  if (local) {
    await persistDockLayoutRecord(local, epoch, userId);
  }
}

// SIG-1316: saved layouts live in user_settings.layouts (the current layout
// stays in user_settings.layout). Guests keep them in localStorage only.
let syncedLayoutsUserId: string | null = null;

export function forgetRemoteLayoutsSync(): void {
  syncedLayoutsUserId = null;
}

export async function persistSavedLayoutsRecord(
  layouts: readonly SavedDockLayout[],
  userId: string | null,
): Promise<void> {
  writeStoredLayouts(layouts);
  const supabase = createBrowserSupabase();
  if (!supabase || !userId) {
    return;
  }
  const { error } = await supabase.from("user_settings").upsert({
    user_id: userId,
    layouts: toJson(layouts),
  });
  if (error) {
    throw error;
  }
}

/** Resolves to the list the store should hold, or null to keep what it has. */
export async function syncRemoteSavedLayouts(userId: string): Promise<SavedDockLayout[] | null> {
  if (syncedLayoutsUserId === userId) {
    return null;
  }
  syncedLayoutsUserId = userId;
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase
    .from("user_settings")
    .select("layouts")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return null;
  }
  const remote = sanitizeSavedLayouts(data?.layouts ?? null);
  if (remote.length > 0) {
    writeStoredLayouts(remote);
    return remote;
  }
  const local = readStoredLayouts();
  if (local.length > 0) {
    await persistSavedLayoutsRecord(local, userId);
    return local;
  }
  return null;
}
