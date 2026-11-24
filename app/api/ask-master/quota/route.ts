import { askMasterLimits, questionsLeft } from "@/src/lib/ask-master/quota";
import { createServerSupabase } from "@/src/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(): Promise<Response> {
  const supabase = await createServerSupabase();
  const result = await supabase?.auth.getUser();
  const user = result?.data?.user;
  if (!supabase || result?.error || !user) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }

  const remaining = await questionsLeft(supabase, user.id, askMasterLimits().userLimit);
  return Response.json({ questionsLeft: remaining }, { headers });
}
