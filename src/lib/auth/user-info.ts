import type { UserInfo } from "@/src/store/slices/types";

export const DISPLAY_NAME_MAX_LENGTH = 60;

type AuthUserLike = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

// SIG-1216: `user_metadata.display_name` is editable by the user themself
// (auth.updateUser from the browser), so it is display-only. NEVER use it, or
// anything else in user_metadata, for authorization or role checks; role lives
// in the server-managed `public.profiles` table.
export function toUserInfo(user: AuthUserLike): UserInfo {
  const raw = user.user_metadata?.display_name;
  const displayName = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  return { id: user.id, email: user.email ?? null, displayName };
}
