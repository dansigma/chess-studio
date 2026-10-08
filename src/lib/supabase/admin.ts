import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseUrl } from "./env";

export function createServiceSupabase(): SupabaseClient<Database> | null {
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.warn("[supabase] service client unavailable: missing SUPABASE_SECRET_KEY (presence only, value not logged).");
    return null;
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
