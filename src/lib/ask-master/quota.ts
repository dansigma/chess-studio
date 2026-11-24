import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

type QuotaClient = SupabaseClient<Database>;
type Limits = { userLimit: number; siteLimit: number };
type ConsumeResult = Database["public"]["Functions"]["consume_ask_master_question"]["Returns"][number];

function dailyLimit(value: string | undefined, fallback: number): number {
  const normalized = value?.trim() ?? "";
  const limit = Number(normalized);
  return /^\d+$/.test(normalized) && limit > 0 && limit <= 2_147_483_647 ? limit : fallback;
}

export function askMasterLimits(env: Record<string, string | undefined> = process.env): Limits {
  return {
    userLimit: dailyLimit(env.ASK_MASTER_USER_DAILY_LIMIT, 5),
    siteLimit: dailyLimit(env.ASK_MASTER_SITE_DAILY_LIMIT, 100),
  };
}

export async function consumeQuestion(
  supabase: Pick<QuotaClient, "rpc">,
  { userLimit, siteLimit }: Limits,
): Promise<ConsumeResult> {
  try {
    const { data, error } = await supabase.rpc("consume_ask_master_question", {
      p_user_limit: userLimit,
      p_site_limit: siteLimit,
    }).single();
    if (!error && data) return data;
  } catch {
    // Transport failures also refuse the question.
  }
  return { allowed: false, reason: "error", remaining: 0 };
}

export async function questionsLeft(
  supabase: Pick<QuotaClient, "auth" | "from">,
  userLimit: number,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return 0;

    const { data, error } = await supabase
      .from("ask_master_usage")
      .select("questions")
      .eq("user_id", user.id)
      .eq("day", today)
      .maybeSingle();
    if (!error) return Math.max(0, userLimit - (data?.questions ?? 0));
  } catch {
    // Treat an unavailable count as exhausted.
  }
  return 0;
}
