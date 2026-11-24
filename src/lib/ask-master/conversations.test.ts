import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { bookKey } from "@/src/chess/opening-book.ts";
import { conversationPositionKey, summarizeConversation } from "./conversations.ts";

test("matches the book key across transpositions and different move clocks", () => {
  const first = new Chess();
  const second = new Chess();
  for (const move of ["Nf3", "d5", "d4", "Nf6"]) first.move(move);
  for (const move of ["d4", "Nf6", "Nf3", "d5"]) second.move(move);
  assert.notEqual(first.fen(), second.fen());
  const expected = bookKey(first.fen()).toString();
  assert.equal(conversationPositionKey(first.fen()), expected);
  assert.equal(conversationPositionKey(second.fen()), expected);
  assert.equal(conversationPositionKey("invalid"), null);
});

test("summarizes stored messages and handles empty history", () => {
  const row = { id: "id", updated_at: "date", game_title: null, model: "model", position_key: "42" };
  const messages = [
    { role: "assistant", text: "Earlier answer" },
    { role: "user", text: "First question" },
    { role: "user", text: "Second question" },
  ];
  assert.deepEqual(summarizeConversation({ ...row, messages }), {
    id: "id", updatedAt: "date", gameTitle: null, model: "model", positionKey: "42",
    firstQuestion: "First question", messageCount: 3,
  });
  assert.equal(summarizeConversation({ ...row, messages: [] }).firstQuestion, null);
});
