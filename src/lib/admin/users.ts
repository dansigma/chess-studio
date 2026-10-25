import "server-only";
import { createServiceSupabase } from "@/src/lib/supabase/admin";
import { ADMIN_USERS_PAGE_SIZE, type AdminListUser } from "@/src/admin/user-list";

export { ADMIN_USERS_PAGE_SIZE };
export type { AdminListUser };

export type RoleChangeCode =
  | "invalid_role"
  | "invalid_reason"
  | "not_found"
  | "own_role"
  | "unchanged"
  | "last_admin"
  | "unavailable";

export type ChangeUserRoleInput = {
  userId: string;
  newRole: string;
  changedBy: string;
  reason: string;
};

const ROLE_CHANGE_CODES: ReadonlyArray<Exclude<RoleChangeCode, "unavailable">> = [
  "invalid_role",
  "invalid_reason",
  "not_found",
  "own_role",
  "unchanged",
  "last_admin",
];

function toRoleChangeCode(message: string): RoleChangeCode {
  for (const code of ROLE_CHANGE_CODES) {
    if (message.includes(code)) {
      return code;
    }
  }
  return "unavailable";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

export async function listUsers(input: {
  search?: string | null;
  role?: string | null;
  page?: number | null;
}): Promise<{ ok: true; data: { users: AdminListUser[]; total: number } } | { ok: false; code: RoleChangeCode }> {
  const admin = createServiceSupabase();
  if (!admin) {
    return { ok: false, code: "unavailable" };
  }
  const page = Math.max(1, Math.floor(input.page ?? 1) || 1);
  const search = input.search?.trim() ? input.search : null;
  const role = input.role?.trim() ? input.role : null;
  const { data, error } = await admin.rpc("admin_list_users", {
    p_search: search,
    p_role: role,
    p_limit: ADMIN_USERS_PAGE_SIZE,
    p_offset: (page - 1) * ADMIN_USERS_PAGE_SIZE,
  });
  if (error) {
    return { ok: false, code: toRoleChangeCode(errorMessage(error)) };
  }
  const users = (data ?? []) as AdminListUser[];
  const firstTotal = users[0]?.total;
  if (users.length > 0 && typeof firstTotal === "number") {
    return { ok: true, data: { users, total: firstTotal } };
  }
  // Empty page (no matches, or past the last row): count separately so the
  // admin UI can tell "no users match" from "page past the end".
  const { data: totalData, error: totalError } = await admin.rpc("admin_count_users", {
    p_search: search,
    p_role: role,
  });
  if (totalError) {
    return { ok: false, code: toRoleChangeCode(errorMessage(totalError)) };
  }
  return { ok: true, data: { users, total: typeof totalData === "number" ? totalData : 0 } };
}

export async function changeUserRole(
  input: ChangeUserRoleInput,
): Promise<{ ok: true; oldRole: string } | { ok: false; code: RoleChangeCode }> {
  const admin = createServiceSupabase();
  if (!admin) {
    return { ok: false, code: "unavailable" };
  }
  const { data, error } = await admin.rpc("set_user_role", {
    p_user_id: input.userId,
    p_new_role: input.newRole,
    p_changed_by: input.changedBy,
    p_reason: input.reason,
  });
  if (error) {
    return { ok: false, code: toRoleChangeCode(errorMessage(error)) };
  }
  return { ok: true, oldRole: data };
}
