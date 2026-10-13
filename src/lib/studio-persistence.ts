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
import { exportPgn } from "@/src/chess/pgn";
import { isBoardTheme } from "@/src/chess/board-themes";
import { isPieceSet } from "@/src/chess/piece-sets";
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
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  return data.id;
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
  const { error } = await supabase.from("user_settings").upsert({
    user_id: userId,
    show_coordinates: settings.showCoordinates,
    piece_theme: settings.pieceSet,
    board_theme: settings.boardTheme,
    engine_depth: settings.engineDepth,
    multi_pv: settings.multiPv,
  });
  if (error) {
    throw error;
  }
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
    .select("show_coordinates, board_theme, piece_theme, engine_depth, multi_pv")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return {
    showCoordinates: data.show_coordinates,
    boardTheme: isBoardTheme(data.board_theme) ? data.board_theme : undefined,
    pieceSet: isPieceSet(data.piece_theme) ? data.piece_theme : undefined,
    engineDepth: data.engine_depth,
    multiPv: data.multi_pv,
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
