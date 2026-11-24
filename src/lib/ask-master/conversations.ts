import { validateFen } from "chess.js";
import { bookKey } from "@/src/chess/opening-book";
import type { createServerSupabase } from "@/src/lib/supabase/server";
import type { Database } from "@/src/lib/supabase/database.types";

type SessionClient = NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;
type ConversationRow = Database["public"]["Tables"]["ask_master_conversations"]["Row"];

export const CONVERSATION_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Unsigned 64-bit book key as decimal text; null for an unusable FEN. */
export function conversationPositionKey(fen: string): string | null {
  try {
    return validateFen(fen).ok ? bookKey(fen).toString() : null;
  } catch {
    return null;
  }
}

export function isPositionKeyList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 300 &&
    value.every((key) => typeof key === "string" && key.length >= 1 && key.length <= 20 && !/[^0-9]/.test(key));
}

export function summarizeConversation(row: Pick<ConversationRow,
  "id" | "updated_at" | "game_title" | "messages" | "model" | "position_key"
>) {
  const messages = Array.isArray(row.messages) ? row.messages : [];
  const first = messages.find((message): message is { role: "user"; text: string } =>
    message !== null && typeof message === "object" && !Array.isArray(message) &&
    message.role === "user" && typeof message.text === "string",
  );
  return {
    id: row.id,
    updatedAt: row.updated_at,
    gameTitle: row.game_title,
    firstQuestion: first?.text ?? null,
    messageCount: messages.length,
    model: row.model,
    positionKey: row.position_key,
  };
}

export async function saveConversationTurn(supabase: SessionClient, turn: {
  id: string;
  positionKey: string;
  fen: string;
  gameTitle?: string;
  question: string;
  answer: string;
  model: string;
}) {
  const { error } = await supabase.rpc("save_ask_master_conversation_turn", {
    p_id: turn.id,
    p_position_key: turn.positionKey,
    p_fen: turn.fen,
    p_game_title: turn.gameTitle ?? null,
    p_question: turn.question,
    p_answer: turn.answer,
    p_model: turn.model,
  });
  if (error) throw error;
}

export async function listConversations(supabase: SessionClient, userId: string, positionKeys: string[]) {
  const { data, error } = await supabase.from("ask_master_conversations")
    .select("id, updated_at, game_title, messages, model, position_key")
    .eq("user_id", userId)
    .in("position_key", [...new Set(positionKeys)])
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data.map(summarizeConversation);
}

export async function deleteConversation(supabase: SessionClient, userId: string, id: string) {
  const { data, error } = await supabase.from("ask_master_conversations")
    .delete()
    .eq("user_id", userId)
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length > 0;
}
