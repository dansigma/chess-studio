import { createStore } from "zustand";
import type { SiteLocale } from "@/src/i18n/locale";

import { collectPositionPack, type PackPosition } from "./collect-pack";

type Message = { role: "user" | "assistant"; text: string };
type ChatError = "rateLimit" | "userLimit" | "siteLimit" | "unavailable" | "signInPrompt";
type ChatStatus = "idle" | "analyzing" | "answering" | ChatError;

export const MAX_QUESTION_LENGTH = 1000;

type ChatState = {
  conversationId: string | null;
  messages: Message[];
  status: ChatStatus;
  questionsLeft: number | null;
  refreshQuota: () => Promise<void>;
  send: (question: string, locale: SiteLocale, position: PackPosition) => Promise<void>;
  close: () => void;
  reset: () => void;
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
    async send(question, locale, position) {
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
      const submitted: Message[] = [...messages, { role: "user", text: question }];

      set({ conversationId, messages: submitted, status: "analyzing" });
      let status: ChatStatus = "idle";
      let answer = "";
      try {
        const context = await collectPositionPack(position, request.signal);
        if (request.signal.aborted) return;
        set({ status: "answering" });
        const response = await fetch("/api/ask-master", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, question, locale, history, context }),
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
        try {
          while (!request.signal.aborted) {
            const { done, value } = await reader.read();
            if (request.signal.aborted) break;
            answer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            if (answer) set({ messages: [...submitted, { role: "assistant", text: answer }] });
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
      if (get().status === "answering" || get().status === "analyzing") set({ status: "idle" });
    },
    reset() {
      const wasBusy = get().status === "answering" || get().status === "analyzing";
      answerRequest?.abort();
      answerRequest = undefined;
      set({ conversationId: crypto.randomUUID(), messages: [], status: "idle" });
      if (wasBusy) void get().refreshQuota();
    },
  }));
}

export type AskMasterStore = ReturnType<typeof createAskMasterStore>;
