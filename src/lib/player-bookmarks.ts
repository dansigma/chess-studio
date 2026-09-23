import { createBrowserSupabase } from "@/src/lib/supabase/client";
import type { PlayerHit, PlayerSource } from "@/src/lib/player-types";

const BOOKMARKS_KEY = "studio-clone-bookmarks";

export type PlayerBookmark = PlayerHit & {
  bookmarkedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlayerSource(value: unknown): value is PlayerSource {
  return value === "lichess" || value === "chesscom" || value === "studio";
}

export function bookmarkKey(player: Pick<PlayerHit, "source" | "username">): string {
  return `${player.source}:${player.username.trim().toLowerCase()}`;
}

function readBookmark(value: unknown): PlayerBookmark | null {
  if (
    !isRecord(value) ||
    !isPlayerSource(value.source) ||
    typeof value.username !== "string" ||
    typeof value.displayName !== "string"
  ) {
    return null;
  }
  const username = value.username.trim().toLowerCase();
  if (!username) {
    return null;
  }
  return {
    id: bookmarkKey({ source: value.source, username }),
    source: value.source,
    username,
    displayName: value.displayName,
    subtitle: typeof value.subtitle === "string" ? value.subtitle : "",
    title: typeof value.title === "string" ? value.title : undefined,
    bookmarkedAt: typeof value.bookmarkedAt === "number" ? value.bookmarkedAt : Date.now(),
  };
}

export function loadLocalBookmarks(): PlayerBookmark[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const byKey = new Map<string, PlayerBookmark>();
    for (const item of parsed) {
      const bookmark = readBookmark(item);
      if (!bookmark) {
        continue;
      }
      byKey.set(bookmarkKey(bookmark), bookmark);
    }
    return [...byKey.values()].sort((a, b) => a.bookmarkedAt - b.bookmarkedAt);
  } catch {
    return [];
  }
}

export function saveLocalBookmarks(bookmarks: PlayerBookmark[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
}

export function upsertBookmark(list: PlayerBookmark[], player: PlayerHit): PlayerBookmark[] {
  const next = readBookmark({
    ...player,
    bookmarkedAt: Date.now(),
  });
  if (!next) {
    return list;
  }
  const key = bookmarkKey(next);
  if (list.some((item) => bookmarkKey(item) === key)) {
    return list;
  }
  return [...list, next];
}

export function removeBookmark(list: PlayerBookmark[], player: Pick<PlayerHit, "source" | "username">): PlayerBookmark[] {
  const key = bookmarkKey(player);
  return list.filter((item) => bookmarkKey(item) !== key);
}

export function mergeBookmarks(local: PlayerBookmark[], remote: PlayerBookmark[]): PlayerBookmark[] {
  const byKey = new Map<string, PlayerBookmark>();
  for (const item of [...local, ...remote]) {
    const key = bookmarkKey(item);
    const existing = byKey.get(key);
    if (!existing || item.bookmarkedAt < existing.bookmarkedAt) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => a.bookmarkedAt - b.bookmarkedAt);
}

export async function persistRemoteBookmark(
  bookmark: PlayerBookmark,
  userId: string,
): Promise<void> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return;
  }
  await supabase.from("player_bookmarks").upsert(
    {
      user_id: userId,
      source: bookmark.source,
      username: bookmark.username,
      display_name: bookmark.displayName,
      subtitle: bookmark.subtitle,
      title: bookmark.title ?? null,
    },
    { onConflict: "user_id,source,username" },
  );
}

export async function deleteRemoteBookmark(
  player: Pick<PlayerHit, "source" | "username">,
  userId: string,
): Promise<void> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return;
  }
  await supabase
    .from("player_bookmarks")
    .delete()
    .eq("user_id", userId)
    .eq("source", player.source)
    .eq("username", player.username.trim().toLowerCase());
}

export async function loadRemoteBookmarks(userId: string): Promise<PlayerBookmark[]> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from("player_bookmarks")
    .select("source, username, display_name, subtitle, title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error || !data) {
    return [];
  }
  return data.flatMap((row) => {
    const bookmark = readBookmark({
      source: row.source,
      username: row.username,
      displayName: row.display_name,
      subtitle: row.subtitle,
      title: row.title ?? undefined,
      bookmarkedAt: Date.parse(row.created_at) || Date.now(),
    });
    return bookmark ? [bookmark] : [];
  });
}
