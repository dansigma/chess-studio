import "server-only";
import { createServiceSupabase } from "@/src/lib/supabase/admin";
import type { Role } from "@/src/lib/auth/roles";

/**
 * Server-side coach invites (SIG-1062). All functions run with the service
 * role: `coach_invites` is RLS deny-all, so only this boundary can read or
 * write it.
 *
 * Callers (server actions) must resolve the caller's role with `getRole` and
 * pass it in; this module never trusts client-supplied role claims.
 */

export type AcceptCode =
  | "accepted"
  | "invalid"
  | "not_found"
  | "expired"
  | "revoked"
  | "consumed"
  | "email_mismatch"
  | "role_unchanged";

export type InviteAdminCode = "forbidden" | "unavailable" | "invalid_email" | "not_found";

export class CoachInviteError extends Error {
  readonly code: InviteAdminCode | AcceptCode;

  constructor(code: InviteAdminCode | AcceptCode) {
    super(`coach invite failed: ${code}`);
    this.name = "CoachInviteError";
    this.code = code;
  }
}

export interface CreatedInvite {
  id: string;
  /** Raw token, returned once for the admin to copy into a link. Never stored. */
  token: string;
  expiresAt: string;
}

export interface CoachInviteRow {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** SHA-256 hex of `input`, via Web Crypto (Workers-compatible). Exported for tests. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 32 random bytes as base64url (43 chars). Exported for tests. */
export function randomInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function requireAdmin(role: Role | null): void {
  if (role !== "admin") {
    throw new CoachInviteError("forbidden");
  }
}

function serviceOrThrow() {
  const service = createServiceSupabase();
  if (!service) {
    throw new CoachInviteError("unavailable");
  }
  return service;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function insertInviteRow(service: ReturnType<typeof serviceOrThrow>, email: string, invitedBy: string) {
  const token = randomInviteToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await service
    .from("coach_invites")
    .insert({ email, invited_by: invitedBy, token_hash: tokenHash, expires_at: expiresAt })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[coach-invites] createInvite: insert failed", { error });
    throw new CoachInviteError("unavailable");
  }
  return { id: (data as { id: string }).id, token, expiresAt };
}

/**
 * Create a single-use invite for `email`, valid 7 days. Returns the raw token
 * once so the admin can copy it into a link; only the SHA-256 hash is stored.
 */
export async function createInvite(options: {
  callerRole: Role | null;
  email: string;
  invitedBy: string;
}): Promise<CreatedInvite> {
  requireAdmin(options.callerRole);
  const email = normalizeEmail(options.email);
  if (!email) {
    throw new CoachInviteError("invalid_email");
  }
  return insertInviteRow(serviceOrThrow(), email, options.invitedBy);
}

/**
 * Revoke a pending invite. Accepted or already-revoked invites throw
 * `CoachInviteError("not_found")`.
 */
export async function revokeInvite(options: { callerRole: Role | null; inviteId: string }): Promise<void> {
  requireAdmin(options.callerRole);
  const service = serviceOrThrow();
  const { data, error } = await service
    .from("coach_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", options.inviteId)
    .is("revoked_at", null)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[coach-invites] revokeInvite: update failed", { error });
    throw new CoachInviteError("unavailable");
  }
  if (!data) {
    throw new CoachInviteError("not_found");
  }
}

/**
 * Revoke the pending invite and create a fresh one for the same email.
 * Returns the new raw token for the admin to copy.
 */
export async function resendInvite(options: {
  callerRole: Role | null;
  inviteId: string;
  invitedBy: string;
}): Promise<CreatedInvite> {
  requireAdmin(options.callerRole);
  const service = serviceOrThrow();
  const { data: row, error: readError } = await service
    .from("coach_invites")
    .select("id, email, accepted_at, revoked_at")
    .eq("id", options.inviteId)
    .maybeSingle();
  if (readError) {
    console.error("[coach-invites] resendInvite: lookup failed", { error: readError });
    throw new CoachInviteError("unavailable");
  }
  const invite = row as { id: string; email: string; accepted_at: string | null; revoked_at: string | null } | null;
  if (!invite || invite.accepted_at || invite.revoked_at) {
    throw new CoachInviteError("not_found");
  }
  const { error: revokeError } = await service
    .from("coach_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", options.inviteId);
  if (revokeError) {
    console.error("[coach-invites] resendInvite: revoke failed", { error: revokeError });
    throw new CoachInviteError("unavailable");
  }
  return insertInviteRow(service, invite.email, options.invitedBy);
}

/** Newest-first invite rows for the admin screen. */
export async function listInvites(options: { callerRole: Role | null }): Promise<CoachInviteRow[]> {
  requireAdmin(options.callerRole);
  const service = serviceOrThrow();
  const { data, error } = await service
    .from("coach_invites")
    .select("id, email, expires_at, accepted_at, revoked_at, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[coach-invites] listInvites: select failed", { error });
    throw new CoachInviteError("unavailable");
  }
  return ((data ?? []) as Array<Record<string, string | null>>).map((row) => ({
    id: String(row.id),
    email: String(row.email),
    expiresAt: String(row.expires_at),
    acceptedAt: row.accepted_at == null ? null : String(row.accepted_at),
    revokedAt: row.revoked_at == null ? null : String(row.revoked_at),
    createdAt: String(row.created_at),
  }));
}

export interface AcceptInviteResult {
  ok: boolean;
  code: AcceptCode;
}

/**
 * Accept an invite link: hashes the raw token and calls `accept_coach_invite`,
 * which enforces single-use, expiry, email match, and student-only promotion.
 * Unconfirmed emails fail closed without touching the database.
 */
export async function acceptInvite(options: {
  token: string;
  userId: string;
  email: string;
  emailConfirmedAt: string | null | undefined;
}): Promise<AcceptInviteResult> {
  if (!options.emailConfirmedAt) {
    return { ok: false, code: "email_mismatch" };
  }
  const service = serviceOrThrow();
  const tokenHash = await sha256Hex(options.token);
  const { data, error } = await service.rpc("accept_coach_invite", {
    p_token_hash: tokenHash,
    p_email: normalizeEmail(options.email),
    p_user_id: options.userId,
  });
  if (error) {
    console.error("[coach-invites] acceptInvite: rpc failed", { error });
    throw new CoachInviteError("unavailable");
  }
  const result = data as { ok: boolean; code: AcceptCode } | null;
  if (!result || typeof result.ok !== "boolean" || typeof result.code !== "string") {
    console.error("[coach-invites] acceptInvite: malformed rpc payload");
    throw new CoachInviteError("unavailable");
  }
  return result;
}
