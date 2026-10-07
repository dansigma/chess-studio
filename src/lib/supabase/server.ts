import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getSupabasePublicKey, getSupabaseUrl, isSupabaseConfigured } from "./env";

export async function createServerSupabase() {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return null;
  }
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component; middleware refreshes the session.
        }
      },
    },
  });
}

/**
 * Cookie-free public client for the courses catalog. Published courses are
 * publicly readable, so the catalog/server pages fetch them without the
 * user session — no `cookies()` in the render path, which keeps the routes
 * statically renderable (ISR) instead of opting into dynamic rendering.
 */
export function createPublicServerSupabase() {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return null;
  }
  return createClient<Database>(url, key);
}
