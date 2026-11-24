import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

type QuotaClient = SupabaseClient<Database>;
type Limits = { userLimit: number; siteLimit: number };
type ConsumeInput = Limits & { userId: string };
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

/**
 * Takes one question from the user's daily quota and one request from the site
 * cap. `supabase` must be the service-role client (`createServiceSupabase`):
 * the RPC is not callable by signed-in users, so the caller passes the id of a
 * user it has already verified.
 */
export async function consumeQuestion(
  supabase: Pick<QuotaClient, "rpc">,
  { userId, userLimit, siteLimit }: ConsumeInput,
): Promise<ConsumeResult> {
  try {
    const { data, error } = await supabase.rpc("consume_ask_master_question", {
      p_user_id: userId,
      p_user_limit: userLimit,
      p_site_limit: siteLimit,
    }).single();
    if (!error && data) return data;
    console.error("ask-master: quota RPC failed", error?.message ?? "no result");
  } catch (cause) {
    // Transport failures also refuse the question.
    console.error("ask-master: quota RPC failed", cause instanceof Error ? cause.message : cause);
  }
  return { allowed: false, reason: "error", remaining: 0 };
}

/**
 * Questions the user has left today. Takes the id of a user the caller has
 * already verified, so it works with the session client (own-row RLS) and
 * with the service-role client alike.
 */
export async function questionsLeft(
  supabase: Pick<QuotaClient, "from">,
  userId: string,
  userLimit: number,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data, error } = await supabase
      .from("ask_master_usage")
      .select("questions")
      .eq("user_id", userId)
      .eq("day", today)
      .maybeSingle();
    if (!error) return Math.max(0, userLimit - (data?.questions ?? 0));
    console.error("ask-master: quota read failed", error.message);
  } catch (cause) {
    // Treat an unavailable count as exhausted.
    console.error("ask-master: quota read failed", cause instanceof Error ? cause.message : cause);
  }
  return 0;
}
