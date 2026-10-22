// SIG-1088: user-triggered incremental import of recent public games
// (My Games 2/5). Fetches only-what-is-new per linked account into
// `public.my_games` and advances `linked_accounts.last_synced_at`.
//
// Test seam: loaders are injected via `setSyncLoadersForTest` so route tests
// avoid network; production wires the real `lichessGamesSince` /
// `chesscomGamesSince`.
import { NextRequest, NextResponse } from "next/server";
import { loadLinkedAccounts, type LinkedAccountSource } from "@/src/lib/my-games/linked-accounts";
import { playerGameToRow } from "@/src/lib/my-games/game-row";
import { chesscomGamesSince } from "@/src/lib/players/chesscom";
import { lichessGamesSince } from "@/src/lib/players/lichess";
import type { PlayerGame } from "@/src/lib/player-types";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { createServerSupabase } from "@/src/lib/supabase/server";

export const MAX_SYNC_GAMES = 200;
const FIRST_SYNC_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

// 6 syncs/hour per user, 20/hour per IP (issue quotas). The fallback is the
// authority for the hourly quotas: any anonymous/sec scan shares one
// `unknown` IP bucket, so `checkAsync` rejects the 7th sync in the hour even
// with no edge binding (covered by the 429 route test). On Cloudflare the
// native binding only adds an edge burst cap (RL_AUTH: 10 req/60s per key,
// RL_30_MIN: 30 req/60s per key — both ANDed with the fallback, which still
// denies the 7th request in the hour). The binding caps are deliberately
// roomier than the hourly quotas (10 > 6 and 30 > 20), so the edge burst cap
// can never fire before the hourly quota on a fresh window and only adds an
// independent per-minute burst ceiling on top — same split-quota pattern as
// the auth limiters (see app/login/actions.ts).
const userLimiter = createRouteLimiter({ limit: 6, windowMs: 60 * 60 * 1000, bindingName: "RL_AUTH" });
const ipLimiter = createRouteLimiter({ limit: 20, windowMs: 60 * 60 * 1000, bindingName: "RL_30_MIN" });

type Loaders = {
  lichess: typeof lichessGamesSince;
  chesscom: typeof chesscomGamesSince;
};

const loaders: Loaders = { lichess: lichessGamesSince, chesscom: chesscomGamesSince };

export function setSyncLoadersForTest(overrides: Partial<Loaders>): void {
  if (overrides.lichess) {
    loaders.lichess = overrides.lichess;
  }
  if (overrides.chesscom) {
    loaders.chesscom = overrides.chesscom;
  }
}

export function resetSyncLoadersForTest(): void {
  loaders.lichess = lichessGamesSince;
  loaders.chesscom = chesscomGamesSince;
}

export type SyncAccountResult = {
  source: LinkedAccountSource;
  imported: number;
  error?: string;
};

function sinceMsFor(lastSyncedAt: string | null): number {
  if (lastSyncedAt) {
    const parsed = Date.parse(lastSyncedAt);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Date.now() - FIRST_SYNC_LOOKBACK_MS;
}

// Advance the per-account cursor to the newest *stored* row only. Games the
// mapper skips (empty PGN → null) or that were already stored must not move
// the cursor, otherwise unmappable games are never retried.
async function updateLastSynced(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
  userId: string,
  source: LinkedAccountSource,
  newestIso: string,
): Promise<void> {
  const { error } = await supabase
    .from("linked_accounts")
    .update({ last_synced_at: newestIso })
    .eq("user_id", userId)
    .eq("source", source);
  if (error) {
    console.error("my-games sync last_synced_at update failed", { source, error });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Sync is unavailable right now." }, { status: 503 });
  }
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return NextResponse.json({ error: "Sign in to sync games." }, { status: 401 });
  }

  const ip = clientIp(request.headers);
  const userVerdict = await userLimiter.checkAsync(rateLimitKey("my-games-sync", user.id));
  const ipVerdict = await ipLimiter.checkAsync(rateLimitKey("my-games-sync-ip", ip));
  const denied = !userVerdict.ok ? userVerdict : !ipVerdict.ok ? ipVerdict : null;
  if (denied) {
    return NextResponse.json(
      { error: "Too many syncs — try again later." },
      { status: 429, headers: { "Retry-After": String(denied.retryAfterSeconds) } },
    );
  }

  const linked = await loadLinkedAccounts(supabase);
  if (!linked.ok) {
    return NextResponse.json({ error: "Could not load linked accounts." }, { status: 502 });
  }
  if (linked.accounts.length === 0) {
    return NextResponse.json({ imported: 0, accounts: [] });
  }

  const accounts: SyncAccountResult[] = [];
  let imported = 0;
  for (const account of linked.accounts) {
    const entry: SyncAccountResult = { source: account.source, imported: 0 };
    const sinceMs = sinceMsFor(account.lastSyncedAt);
    const remaining = MAX_SYNC_GAMES - imported;
    if (remaining <= 0) {
      accounts.push(entry);
      continue;
    }
    let games: PlayerGame[];
    try {
      const fetchSince =
        account.source === "lichess" ? loaders.lichess : loaders.chesscom;
      games = await fetchSince(account.username, sinceMs, remaining);
    } catch (error) {
      console.error("my-games sync upstream failed", { source: account.source, error });
      entry.error = "upstream_unavailable";
      accounts.push(entry);
      continue;
    }
    const rows = games
      .map((game) => playerGameToRow(user.id, account.source, game))
      .filter((row) => row !== null);
    if (rows.length > 0) {
      // postgrest-js resolves `onConflict ... ignoreDuplicates` against the
      // `Prefer: return=representation&resolution=ignore-duplicates` contract,
      // whose response rows omit conflict-skipped entries, so `inserted`
      // normally counts only newly stored rows. That response shape is
      // driver- and PostgREST-version-dependent, so don't trust it as the
      // acceptance-critical `imported` count: diff against what's already
      // stored first (`inserted` then only confirms the write succeeded).
      const { data: existing, error: existingError } = await supabase
        .from("my_games")
        .select("external_id")
        .eq("user_id", user.id)
        .eq("source", account.source)
        .in(
          "external_id",
          rows.map((row) => row.external_id),
        );
      if (existingError) {
        console.error("my-games sync pre-select failed", { source: account.source, error: existingError });
        entry.error = "unavailable";
        accounts.push(entry);
        continue;
      }
      const known = new Set(
        (existing ?? []).map((row: { external_id: string }) => row.external_id),
      );
      const fresh = rows.filter((row) => !known.has(row.external_id));
      if (fresh.length > 0) {
        const { error } = await supabase
          .from("my_games")
          .upsert(fresh, { onConflict: "user_id,source,external_id", ignoreDuplicates: true });
        if (error) {
          console.error("my-games sync insert failed", { source: account.source, error });
          entry.error = "unavailable";
          accounts.push(entry);
          continue;
        }
        entry.imported = fresh.length;
        imported += entry.imported;
      }
      const newestIso = fresh
        .map((row) => row.played_at)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .sort()
        .at(-1);
      if (newestIso !== undefined && newestIso.length > 0) {
        await updateLastSynced(supabase, user.id, account.source, newestIso);
      }
      accounts.push(entry);
      continue;
    }
    accounts.push(entry);
  }
  return NextResponse.json({ imported, accounts });
}
