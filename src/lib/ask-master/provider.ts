import "server-only";
import { answerStatus } from "./answer-status";
import type { ChatMessage } from "./prompt";

type ProviderConfig = { baseUrl: string; apiKey: string; model: string; options?: Record<string, unknown> };

/**
 * Extra request-body fields for the provider, as a JSON object in
 * ASK_MASTER_REQUEST_OPTIONS, e.g. `{"thinking":{"type":"disabled"}}` to turn
 * off DeepSeek reasoning (about 100 s → 8 s per answer). Invalid JSON, a
 * non-object, or fields that would override model/messages/stream are ignored.
 */
export function parseRequestOptions(
  raw: string | undefined, name = "ASK_MASTER_REQUEST_OPTIONS",
): Record<string, unknown> | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object");
    // The request body always sets these itself.
    return Object.fromEntries(Object.entries(value).filter(([key]) => !["model", "messages", "stream"].includes(key)));
  } catch {
    console.error(`ask-master: ${name} is not a JSON object; ignored`);
    return undefined;
  }
}

export function askMasterProviderConfig(): ProviderConfig | null {
  const baseUrl = process.env.ASK_MASTER_BASE_URL?.trim();
  const apiKey = process.env.ASK_MASTER_API_KEY?.trim();
  const model = process.env.ASK_MASTER_MODEL?.trim();
  const options = parseRequestOptions(process.env.ASK_MASTER_REQUEST_OPTIONS);
  return baseUrl && apiKey && model ? { baseUrl, apiKey, model, ...(options ? { options } : {}) } : null;
}

async function* sseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split(/\r\n|\n|\r(?!$)/);
      pending = lines.pop() ?? "";
      yield* lines;
      if (done) {
        if (pending) yield pending;
        return;
      }
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function* textDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string, boolean> {
  let finished = false;
  for await (const line of sseLines(body)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return true;
    if (!data) continue;
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      continue; // A malformed event line is skipped, not fatal.
    }
    if (event?.error) throw new Error("Upstream stream failed");
    const choice = event?.choices?.[0];
    if (typeof choice?.finish_reason === "string") finished = true;
    const content = choice?.delta?.content;
    if (typeof content === "string" && content) yield content;
  }
  return finished;
}

export async function streamChat(
  config: ProviderConfig,
  { conversationId, messages, signal, verify, onComplete }: {
    conversationId: string;
    messages: ChatMessage[];
    signal: AbortSignal;
    verify?: (text: string, signal: AbortSignal, info: { elapsedMs: number }) => Promise<string>;
    onComplete?: (text: string) => Promise<void>;
  },
  fetchProvider: typeof fetch = fetch,
): Promise<Response> {
  const startedAt = Date.now();
  const upstream = new AbortController();
  // 60 s for the provider to accept the request (response headers), 4 min for
  // the whole answer. Reasoning models stream "reasoning_content" before any
  // answer text, often for more than a minute, so the 60 s limit must not wait
  // for the first answer token.
  const firstByte = setTimeout(() => upstream.abort(), 60_000);
  const upstreamSignal = AbortSignal.any([upstream.signal, signal, AbortSignal.timeout(240_000)]);
  try {
    const response = await fetchProvider(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "xadrez-digital-ask-master/1.0",
        "x-opencode-session": conversationId,
        "HTTP-Referer": "https://xadrez.digital",
        "X-Title": "Xadrez Digital",
      },
      body: JSON.stringify({ ...config.options, model: config.model, messages, stream: true }),
      signal: upstreamSignal,
      // Workers only accepts "follow" or "manual" here; "error" makes every
      // request fail before it leaves the edge (Invalid redirect value).
      // A redirect is not expected from the provider, so "manual" keeps the
      // response and lets the !response.ok check below turn it into a 503.
      redirect: "manual",
    });

    if (!response.ok || !response.body) throw new Error("Upstream response failed");
    clearTimeout(firstByte);
    const deltas = textDeltas(response.body);
    // Without status frames (no verify) wait for the first delta, so an early
    // stream failure can still return a 503. With verify, answer at once: the
    // status frames below keep the connection alive while a reasoning model
    // thinks for a minute or more before writing.
    const first = verify ? null : await deltas.next();
    if (first?.done) throw new Error("Upstream returned no answer");
    const encoder = new TextEncoder();
    const requestSignal = AbortSignal.any([signal, upstream.signal]);
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    let lastStatus = answerStatus.analyzing;
    const stopKeepAlive = () => clearInterval(keepAlive);

    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        if (!verify) return;
        controller.enqueue(encoder.encode(answerStatus.analyzing));
        // Unknown or repeated status frames are ignored by the client; they only
        // keep proxies and mobile browsers from dropping an idle connection.
        keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(lastStatus));
          } catch {
            stopKeepAlive();
          }
        }, 10_000);
      },
      async pull(controller) {
        try {
          const chunks = first ? [first.value as string] : [];
          // Some proxies close the stream without [DONE] or finish_reason. The
          // answer is still shown, but only a properly finished one is saved.
          let finished = false;
          while (true) {
            const next = await deltas.next();
            if (next.done) {
              finished = next.value;
              if (!finished) console.error("ask-master: provider stream ended without a finish signal");
              break;
            }
            chunks.push(next.value);
          }
          upstreamSignal.throwIfAborted();

          let answer = chunks.join("");
          if (!answer.trim()) throw new Error("Upstream returned no answer");
          if (verify) {
            lastStatus = answerStatus.checking;
            controller.enqueue(encoder.encode(lastStatus));
            answer = await verify(answer, requestSignal, { elapsedMs: Date.now() - startedAt });
          }
          stopKeepAlive();
          requestSignal.throwIfAborted();
          if (finished && onComplete && answer.trim()) {
            try {
              await onComplete(answer);
            } catch {
              console.error("Ask the Master conversation save failed");
            }
          }
          requestSignal.throwIfAborted();
          controller.enqueue(encoder.encode(answer));
          controller.close();
        } catch (cause) {
          stopKeepAlive();
          console.error("ask-master: provider stream failed", cause instanceof Error ? cause.message : cause);
          upstream.abort();
          controller.error(new Error("Upstream stream failed"));
        }
      },
      async cancel() {
        stopKeepAlive();
        upstream.abort();
        await deltas.return(false).catch(() => {});
      },
    }), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    console.error("ask-master: provider request failed", cause instanceof Error ? cause.message : cause);
    clearTimeout(firstByte);
    upstream.abort();
    return Response.json({ error: "upstream" }, { status: 503 });
  }
}
