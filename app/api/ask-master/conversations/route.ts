import { CONVERSATION_ID, deleteConversation, getConversation, isPositionKeyList, listConversations } from "@/src/lib/ask-master/conversations";
import { createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { createServerSupabase } from "@/src/lib/supabase/server";

const limiter = createRouteLimiter({ limit: 60, windowMs: 60_000, bindingName: "RL_60_MIN" });

async function authorize() {
  const supabase = await createServerSupabase();
  if (!supabase) return Response.json({ error: "unavailable" }, { status: 503 });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const userId = data.user.id;
  const burst = await limiter.checkAsync(rateLimitKey("ask-master-conversations", userId));
  if (!burst.ok) {
    return Response.json({ error: "rate_limit" }, {
      status: 429,
      headers: { "Retry-After": String(burst.retryAfterSeconds) },
    });
  }
  return { supabase, userId };
}

export async function POST(request: Request): Promise<Response> {
  const session = await authorize();
  if (session instanceof Response) return session;

  const body: { positionKeys?: unknown } | null = await request.json().catch(() => null);
  if (!isPositionKeyList(body?.positionKeys)) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const conversations = await listConversations(session.supabase, session.userId, body.positionKeys);
    return Response.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}

export async function GET(request: Request): Promise<Response> {
  const session = await authorize();
  if (session instanceof Response) return session;

  const id = new URL(request.url).searchParams.get("id");
  if (id?.length !== 36 || !CONVERSATION_ID.test(id)) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }

  try {
    const conversation = await getConversation(session.supabase, session.userId, id);
    return conversation
      ? Response.json(conversation, { headers: { "Cache-Control": "no-store" } })
      : Response.json({ error: "not_found" }, { status: 404 });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const session = await authorize();
  if (session instanceof Response) return session;

  const id = new URL(request.url).searchParams.get("id");
  if (id?.length !== 36 || !CONVERSATION_ID.test(id)) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }

  try {
    const deleted = await deleteConversation(session.supabase, session.userId, id);
    return deleted
      ? new Response(null, { status: 204 })
      : Response.json({ error: "not_found" }, { status: 404 });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
