import "server-only";
import type { ChatMessage } from "./prompt";

type ProviderConfig = { baseUrl: string; apiKey: string; model: string };

export function askMasterProviderConfig(): ProviderConfig | null {
  const baseUrl = process.env.ASK_MASTER_BASE_URL?.trim();
  const apiKey = process.env.ASK_MASTER_API_KEY?.trim();
  const model = process.env.ASK_MASTER_MODEL?.trim();
  return baseUrl && apiKey && model ? { baseUrl, apiKey, model } : null;
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
  { conversationId, messages, signal, onComplete }: {
    conversationId: string;
    messages: ChatMessage[];
    signal: AbortSignal;
    onComplete?: (text: string) => Promise<void>;
  },
  fetchProvider: typeof fetch = fetch,
): Promise<Response> {
  const upstream = new AbortController();
  // 60 s for the provider to start answering, 3 min for the whole answer:
  // slow free models can stream for more than a minute.
  const firstByte = setTimeout(() => upstream.abort(), 60_000);
  const upstreamSignal = AbortSignal.any([upstream.signal, signal, AbortSignal.timeout(180_000)]);
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
      body: JSON.stringify({ model: config.model, messages, stream: true }),
      signal: upstreamSignal,
      redirect: "error",
    });

    if (!response.ok || !response.body) throw new Error("Upstream response failed");
    const deltas = textDeltas(response.body);
    // Wait for the first delta so early stream failures can still return a 503.
    const first = await deltas.next();
    if (first.done) throw new Error("Upstream returned no answer");
    clearTimeout(firstByte);
    const encoder = new TextEncoder();
    const answer = onComplete ? [first.value] : undefined;

    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(first.value));
      },
      async pull(controller) {
        try {
          const next = await deltas.next();
          if (next.done) {
            if (next.value && !upstreamSignal.aborted && onComplete && answer) {
              try {
                await onComplete(answer.join(""));
              } catch {
                console.error("Ask the Master conversation save failed");
              }
            }
            controller.close();
          } else if (!upstream.signal.aborted) {
            answer?.push(next.value);
            controller.enqueue(encoder.encode(next.value));
          }
        } catch {
          upstream.abort();
          controller.error(new Error("Upstream stream failed"));
        }
      },
      async cancel() {
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
