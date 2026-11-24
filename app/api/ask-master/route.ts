import { isSiteLocale } from "@/src/i18n/locale";
import { CONVERSATION_ID, conversationPositionKey, saveConversationTurn } from "@/src/lib/ask-master/conversations";
import { DEFAULT_ASK_MASTER_LEVEL, isAskMasterLevel } from "@/src/lib/ask-master/level";
import { buildMessages, type PromptInput } from "@/src/lib/ask-master/prompt";
import { askMasterProviderConfig, streamChat } from "@/src/lib/ask-master/provider";
import { askMasterLimits, consumeQuestion } from "@/src/lib/ask-master/quota";
import { createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { readCapped } from "@/src/lib/read-capped";
import { createServiceSupabase } from "@/src/lib/supabase/admin";
import { createServerSupabase } from "@/src/lib/supabase/server";

const limiter = createRouteLimiter({ limit: 10, windowMs: 60_000, bindingName: "RL_AUTH" });
const MAX_CONTEXT_BYTES = 16 * 1024;
// Context, question and history together stay well under this.
const MAX_BODY_BYTES = 64 * 1024;

type ChatInput = PromptInput & { conversationId: string; fen?: string; gameTitle?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHistoryTurn(value: unknown): value is NonNullable<PromptInput["history"]>[number] {
  return isRecord(value) &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.text === "string" && value.text.length <= 4000;
}

async function readInput(request: Request): Promise<ChatInput | null> {
  try {
    const body: unknown = JSON.parse(await readCapped(request, MAX_BODY_BYTES));
    if (!isRecord(body)) return null;

    const { conversationId, locale, question, history, context, fen, gameTitle, level = DEFAULT_ASK_MASTER_LEVEL } = body;
    if (typeof conversationId !== "string" || conversationId.length !== 36 || !CONVERSATION_ID.test(conversationId)) return null;
    if (!isSiteLocale(locale) || !isAskMasterLevel(level) || typeof question !== "string") return null;
    const trimmed = question.trim();
    if (!trimmed || trimmed.length > 1000) return null;
    if (history !== undefined &&
      (!Array.isArray(history) || history.length > 6 || !history.every(isHistoryTurn))) return null;
    if (context !== undefined &&
      new TextEncoder().encode(JSON.stringify(context)).byteLength > MAX_CONTEXT_BYTES) return null;

    if (fen !== undefined && (typeof fen !== "string" || fen.length > 100)) return null;
    if (gameTitle !== undefined && (typeof gameTitle !== "string" || gameTitle.length > 120)) return null;

    return { conversationId, locale, question: trimmed, history, context, fen, gameTitle, level };
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const config = askMasterProviderConfig();
  if (!config) return Response.json({ error: "unavailable" }, { status: 503 });

  const input = await readInput(request);
  if (!input) return Response.json({ error: "invalid_body" }, { status: 400 });

  const supabase = await createServerSupabase();
  if (!supabase) return Response.json({ error: "unavailable" }, { status: 503 });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const userId = data.user.id;
  const burst = await limiter.checkAsync(rateLimitKey("ask-master", userId));
  if (!burst.ok) {
    return Response.json({ error: "rate_limit" }, {
      status: 429,
      headers: { "Retry-After": String(burst.retryAfterSeconds) },
    });
  }

  const service = createServiceSupabase();
  if (!service) return Response.json({ error: "unavailable" }, { status: 503 });
  const quota = await consumeQuestion(service, { userId, ...askMasterLimits() });
  if (!quota.allowed) {
    if (quota.reason === "user_limit" || quota.reason === "site_limit") {
      return Response.json({ error: "quota", reason: quota.reason }, { status: 429 });
    }
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  const { gameTitle, conversationId, question } = input;
  // The widget sends the board inside `context` ({ fen, moves }); a top-level
  // `fen` wins when both are present.
  const contextFen = isRecord(input.context) && typeof input.context.fen === "string" &&
    input.context.fen.length <= 100 ? input.context.fen : undefined;
  const fen = input.fen ?? contextFen;
  const positionKey = fen ? conversationPositionKey(fen) : null;
  return streamChat(config, {
    conversationId,
    messages: buildMessages(input),
    signal: request.signal,
    onComplete: fen && positionKey ? (answer) => saveConversationTurn(supabase, {
      id: conversationId, positionKey, fen, gameTitle, question, answer, model: config.model,
    }) : undefined,
  });
}
