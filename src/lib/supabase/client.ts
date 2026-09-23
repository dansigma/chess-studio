import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabasePublicKey, isSupabaseConfigured } from "./env";

let browserClient: SupabaseClient<Database> | null = null;

export function createBrowserSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (browserClient) {
    return browserClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return null;
  }
  browserClient = createBrowserClient<Database>(url, key);
  return browserClient;
}
