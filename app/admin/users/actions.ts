"use server";

import { headers } from "next/headers";
import { getRole, isAdmin } from "@/src/lib/auth/roles";
import { ADMIN_USERS_PAGE_SIZE, changeUserRole, listUsers } from "@/src/lib/admin/users";
import type { AdminListUser, RoleChangeCode } from "@/src/lib/admin/users";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { createServerSupabase } from "@/src/lib/supabase/server";

// Admin user management: 30 req/min per admin and per IP, sharing the RL_AUTH
// binding family with the auth actions. Keys are namespaced ("admin-users" /
// "admin-users-ip") so quotas stay independent.
const limiter = createRouteLimiter({ limit: 30, windowMs: 60 * 1000, bindingName: "RL_AUTH" });

export type AdminUsersCode = RoleChangeCode | "forbidden" | "rate_limited" | "invalid_page";

export type AdminUsersActionResult<T> = { ok: true; data: T } | { ok: false; code: AdminUsersCode };

async function adminCaller(): Promise<{ ok: true; userId: string } | { ok: false; code: "forbidden" }> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { ok: false, code: "forbidden" };
  }
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return { ok: false, code: "forbidden" };
  }
  if (!isAdmin(await getRole(supabase, user))) {
    return { ok: false, code: "forbidden" };
  }
  return { ok: true, userId: user.id };
}

// Quota is consumed only after inputs validate (mirroring
// app/login/update-password/actions.ts), so malformed requests never burn
// the shared per-IP bucket.
async function consumeAdminQuota(userId: string): Promise<{ ok: true } | { ok: false; code: "rate_limited" }> {
  const ip = clientIp(await headers());
  const userVerdict = await limiter.checkAsync(rateLimitKey("admin-users", userId));
  const ipVerdict = await limiter.checkAsync(rateLimitKey("admin-users-ip", ip));
  if (!userVerdict.ok || !ipVerdict.ok) {
    return { ok: false, code: "rate_limited" };
  }
  return { ok: true };
}

export async function listUsersAction(input: {
  search?: string;
  role?: string;
  page?: number;
}): Promise<AdminUsersActionResult<{ users: AdminListUser[]; total: number }>> {
  if (input.role !== undefined && input.role !== "" && !["student", "coach", "admin"].includes(input.role)) {
    return { ok: false, code: "invalid_role" };
  }
  if (input.page !== undefined && (!Number.isFinite(input.page) || !Number.isInteger(input.page) || input.page < 1)) {
    return { ok: false, code: "invalid_page" };
  }
  const gate = await adminCaller();
  if (!gate.ok) {
    return gate;
  }
  const quota = await consumeAdminQuota(gate.userId);
  if (!quota.ok) {
    return quota;
  }
  return listUsers({ search: input.search, role: input.role, page: input.page });
}

export async function changeRoleAction(input: {
  userId: string;
  newRole: string;
  reason: string;
}): Promise<AdminUsersActionResult<{ oldRole: string }>> {
  if (!["student", "coach", "admin"].includes(input.newRole)) {
    return { ok: false, code: "invalid_role" };
  }
  if (typeof input.userId !== "string" || !input.userId) {
    return { ok: false, code: "not_found" };
  }
  if (typeof input.reason !== "string" || input.reason.trim().length < 3 || input.reason.trim().length > 500) {
    return { ok: false, code: "invalid_reason" };
  }
  const gate = await adminCaller();
  if (!gate.ok) {
    return gate;
  }
  const quota = await consumeAdminQuota(gate.userId);
  if (!quota.ok) {
    return quota;
  }
  const result = await changeUserRole({
    userId: input.userId,
    newRole: input.newRole,
    changedBy: gate.userId,
    reason: input.reason,
  });
  if (!result.ok) {
    return result;
  }
  if (result.oldRole === "admin" && input.newRole !== "admin") {
    try {
      const { createServiceSupabase } = await import("@/src/lib/supabase/admin");
      const service = createServiceSupabase();
      if (service) {
        const { error } = await service.auth.admin.updateUserById(input.userId, {
          app_metadata: { role: null },
        });
        if (error) {
          console.error("[auth] changeRoleAction: app_metadata clear failed", { userId: input.userId, error });
        }
      } else {
        console.error("[auth] changeRoleAction: app_metadata clear failed (service client unavailable)", {
          userId: input.userId,
        });
      }
    } catch (error) {
      console.error("[auth] changeRoleAction: app_metadata clear failed", { userId: input.userId, error });
    }
  }
  return { ok: true, data: { oldRole: result.oldRole } };
}

export { ADMIN_USERS_PAGE_SIZE };
