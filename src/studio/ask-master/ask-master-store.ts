import { createStore } from "zustand";
import { readAnswerStatus } from "@/src/lib/ask-master/answer-status";
import type { AnswerPosition } from "@/src/lib/ask-master/answer-lines";
import type { SiteLocale } from "@/src/i18n/locale";

import type { AskMasterIntent } from "@/src/lib/ask-master/intent";
import { collectPositionPack, type PackPosition } from "./collect-pack";

export type AnswerSource = AnswerPosition & {
  boardId: string;
  path: readonly number[];
  xdGames?: Awaited<ReturnType<typeof collectPositionPack>>["xdGames"];
};
type Message =
  | { role: "user"; text: string; createdAt?: number }
  // A conversation reopened from history has no source: its lines show as text.
  | { role: "assistant"; text: string; createdAt?: number; source?: AnswerSource };
type ChatError = "rateLimit" | "userLimit" | "siteLimit" | "unavailable" | "signInPrompt";
type ChatStatus = "idle" | "analyzing" | "answering" | "checking" | ChatError;

export const MAX_QUESTION_LENGTH = 1000;

type ChatState = {
  conversationId: string | null;
  messages: Message[];
  status: ChatStatus;
  questionsLeft: number | null;
  refreshQuota: () => Promise<void>;
  send: (
    question: string, locale: SiteLocale, position: PackPosition, source: AnswerSource,
    options?: { gameTitle?: string; intent?: AskMasterIntent },
  ) => Promise<void>;
  close: () => void;
  reset: () => void;
  loadConversation: (id: string, messages: Message[]) => void;
};

async function responseError(response: Response): Promise<ChatError> {
  if (response.status === 401) return "signInPrompt";
  if (response.status === 429) {
    const body = await response.json();
    if (body?.error === "rate_limit") return "rateLimit";
    if (body?.error === "quota" && body.reason === "user_limit") return "userLimit";
    if (body?.error === "quota" && body.reason === "site_limit") return "siteLimit";
  }
  return "unavailable";
}

export function createAskMasterStore() {
  let answerRequest: AbortController | undefined;
  let quotaRequest: AbortController | undefined;

  return createStore<ChatState>((set, get) => ({
    conversationId: null,
    messages: [],
    status: "idle",
    questionsLeft: null,
    async refreshQuota() {
      quotaRequest?.abort();
      const request = new AbortController();
      quotaRequest = request;
      try {
        const response = await fetch("/api/ask-master/quota", { signal: request.signal });
        if (!response.ok) return;
        const { questionsLeft } = await response.json();
        if (!request.signal.aborted && Number.isInteger(questionsLeft) && questionsLeft >= 0) {
          set((state) => ({
            questionsLeft,
            status: state.status === "userLimit" && questionsLeft > 0 ? "idle" : state.status,
          }));
        }
      } catch {
        // The POST still enforces quota when a count cannot be loaded.
      } finally {
        if (quotaRequest === request) quotaRequest = undefined;
      }
    },
    async send(question, locale, position, source, { gameTitle, intent = "free" } = {}) {
      const { messages, questionsLeft } = get();
      question = question.trim();
      if (!question || question.length > MAX_QUESTION_LENGTH || answerRequest || questionsLeft === 0) return;

      quotaRequest?.abort();
      const request = new AbortController();
      answerRequest = request;
      const conversationId = get().conversationId ?? crypto.randomUUID();
      const history = messages
        .filter((message) => message.text)
        .slice(-6)
        .map(({ role, text }) => ({ role, text: text.slice(0, 4000) }));
      const submitted: Message[] = [...messages, { role: "user", text: question, createdAt: Date.now() }];

      set({ conversationId, messages: submitted, status: "analyzing" });
      let status: ChatStatus = "idle";
      let answer = "";
      let answerCreatedAt: number | undefined;
      try {
        const context = await collectPositionPack(position, request.signal);
        if (request.signal.aborted) return;
        const answerSource = { ...source, xdGames: context.xdGames };
        set({ status: "answering" });
        const response = await fetch("/api/ask-master", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, question, locale, history, context, level: context.level, gameTitle, intent }),
          signal: request.signal,
        });
        if (!response.ok) {
          status = await responseError(response);
          return;
        }
        if (request.signal.aborted) return;
        if (questionsLeft !== null) set({ questionsLeft: Math.max(0, questionsLeft - 1) });
        if (!response.body) throw new Error("Missing answer stream");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        try {
          while (!request.signal.aborted) {
            const { done, value } = await reader.read();
            if (request.signal.aborted) break;
            pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
            if (!answer) pending = readAnswerStatus(pending, (status) => set({ status }));
            if (pending.startsWith("\0") && !answer) {
              if (done) throw new Error("Incomplete answer status");
              continue;
            }
            answer += pending;
            pending = "";
            if (answer) {
              answerCreatedAt ??= Date.now();
              set({ messages: [...submitted, {
                role: "assistant", text: answer, source: answerSource, createdAt: answerCreatedAt,
              }] });
            }
            if (done) break;
          }
        } finally {
          reader.releaseLock();
        }
        if (!answer.trim()) status = "unavailable";
      } catch {
        status = "unavailable";
      } finally {
        if (answerRequest === request) {
          answerRequest = undefined;
          if (status === "userLimit") {
            set({ status, questionsLeft: 0 });
          } else {
            set({ status });
            void get().refreshQuota();
          }
        }
      }
    },
    close() {
      answerRequest?.abort();
      answerRequest = undefined;
      quotaRequest?.abort();
      quotaRequest = undefined;
      if (["answering", "analyzing", "checking"].includes(get().status)) set({ status: "idle" });
    },
    loadConversation(id, messages) {
      const wasBusy = get().status === "answering" || get().status === "analyzing";
      answerRequest?.abort();
      answerRequest = undefined;
      set({ conversationId: id, messages, status: "idle" });
      if (wasBusy) void get().refreshQuota();
    },
    reset() {
      const wasBusy = ["answering", "analyzing", "checking"].includes(get().status);
      answerRequest?.abort();
      answerRequest = undefined;
      set({ conversationId: crypto.randomUUID(), messages: [], status: "idle" });
      if (wasBusy) void get().refreshQuota();
    },
  }));
}

export type AskMasterStore = ReturnType<typeof createAskMasterStore>;
