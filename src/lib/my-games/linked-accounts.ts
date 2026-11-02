// SIG-1039: linked external chess accounts (My Games 1/5). Typed lib over
// `public.linked_accounts`: one public Lichess / Chess.com username per
// (user, source). Client param is `SupabaseClient<Database>` (same grain as
// `getRole` in `src/lib/auth/roles.ts`); tests cast a hand-rolled fake.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types";

export type LinkedAccountSource = "lichess" | "chesscom";

export type LinkedAccount = {
  source: LinkedAccountSource;
  username: string;
  lastSyncedAt: string | null;
};

export type LinkedAccountsError = "invalid_username" | "unavailable";

export type LinkedAccountsResult =
  | { ok: true; accounts: LinkedAccount[] }
  | { ok: false; error: LinkedAccountsError };

const SOURCE_ORDER: ReadonlyArray<LinkedAccountSource> = ["lichess", "chesscom"];

// Stricter than `isPlayerUsername` ({1,40}): matches the DB check
// `username ~ '^[A-Za-z0-9_-]{2,30}$'` so invalid names never reach the DB.
export function isLinkedAccountUsername(value: string | null | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return /^[A-Za-z0-9_-]{2,30}$/.test(value.trim());
}

export function isLinkedAccountSource(value: unknown): value is LinkedAccountSource {
  return value === "lichess" || value === "chesscom";
}

export type LinkedAccountsLogger = Pick<Console, "warn">;

function supabaseErrorDetails(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }
  const source = error as Record<string, unknown>;
  const details: Record<string, unknown> = {};
  for (const key of ["code", "message", "details", "hint", "status"] as const) {
    if (key in source) {
      details[key] = source[key];
    }
  }
  return Object.keys(details).length > 0 ? details : { message: String(error) };
}

function logLinkedAccountsFailure(logger: LinkedAccountsLogger, op: string, error: unknown): void {
  logger.warn(`[linked-accounts] ${op} failed`, supabaseErrorDetails(error));
}

async function readAccounts(
  client: SupabaseClient<Database>,
): Promise<{ accounts: LinkedAccount[] } | { error: unknown }> {
  const { data, error } = await client
    .from("linked_accounts")
    .select("source,username,last_synced_at")
    .order("source", { ascending: true });
  if (error || !data) {
    return { error: error ?? new Error("empty linked_accounts result") };
  }
  const accounts = [...data]
    .map((row) => ({ source: row.source, username: row.username, lastSyncedAt: row.last_synced_at }))
    .sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source));
  return { accounts };
}

export async function loadLinkedAccounts(
  client: SupabaseClient<Database>,
  logger: LinkedAccountsLogger = console,
): Promise<LinkedAccountsResult> {
  const result = await readAccounts(client);
  if (!("accounts" in result)) {
    logLinkedAccountsFailure(logger, "load", result.error);
    return { ok: false, error: "unavailable" };
  }
  return { ok: true, accounts: result.accounts };
}

export async function saveLinkedAccount(
  client: SupabaseClient<Database>,
  source: LinkedAccountSource,
  username: string,
  logger: LinkedAccountsLogger = console,
): Promise<LinkedAccountsResult> {
  const name = username.trim();
  if (!isLinkedAccountSource(source) || !isLinkedAccountUsername(name)) {
    return { ok: false, error: "invalid_username" };
  }
  const { data: authData, error: authError } = await client.auth.getUser();
  const userId = authError ? null : (authData.user?.id ?? null);
  if (!userId) {
    logLinkedAccountsFailure(logger, "save", authError ?? new Error("missing user"));
    return { ok: false, error: "unavailable" };
  }
  const { error } = await client.from("linked_accounts").upsert({
    user_id: userId,
    source,
    username: name,
  });
  if (error) {
    logLinkedAccountsFailure(logger, "save", error);
    return { ok: false, error: "unavailable" };
  }
  const result = await readAccounts(client);
  if (!("accounts" in result)) {
    logLinkedAccountsFailure(logger, "save", result.error);
    return { ok: false, error: "unavailable" };
  }
  return { ok: true, accounts: result.accounts };
}

export async function removeLinkedAccount(
  client: SupabaseClient<Database>,
  source: LinkedAccountSource,
  logger: LinkedAccountsLogger = console,
): Promise<LinkedAccountsResult> {
  if (!isLinkedAccountSource(source)) {
    return { ok: false, error: "invalid_username" };
  }
  const { data: authData, error: authError } = await client.auth.getUser();
  const userId = authError ? null : (authData.user?.id ?? null);
  if (!userId) {
    logLinkedAccountsFailure(logger, "remove", authError ?? new Error("missing user"));
    return { ok: false, error: "unavailable" };
  }
  const { error } = await client
    .from("linked_accounts")
    .delete()
    .eq("user_id", userId)
    .eq("source", source);
  if (error) {
    logLinkedAccountsFailure(logger, "remove", error);
    return { ok: false, error: "unavailable" };
  }
  const result = await readAccounts(client);
  if (!("accounts" in result)) {
    logLinkedAccountsFailure(logger, "remove", result.error);
    return { ok: false, error: "unavailable" };
  }
  return { ok: true, accounts: result.accounts };
}
