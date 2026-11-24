import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test, type TestContext } from "node:test";
import { teardownDom } from "@/src/test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Chess } from "chess.js";
import { useStudioStore } from "@/src/store/studio-store.ts";
import { AskMasterWidget } from "./AskMasterWidget.tsx";

const initial = useStudioStore.getState();

beforeEach(() => {
  useStudioStore.setState({ user: null, settings: { ...initial.settings, locale: "pt-br" }, boards: initial.boards });
});
afterEach(cleanup);
after(teardownDom);

function open({ signedIn = true, isMobile = false } = {}) {
  if (signedIn) useStudioStore.setState({ user: { id: "user", email: null, displayName: null } });
  const view = render(<AskMasterWidget visible isMobile={isMobile} />);
  fireEvent.click(screen.getByRole("button", { name: "Pergunte ao Mestre" }));
  return view;
}

function ask(question = "Qual é o plano?") {
  fireEvent.change(screen.getByRole("textbox", { name: "Sua pergunta" }), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

function mockApi(t: TestContext, post: (init: RequestInit) => Response, remaining = 3) {
  return t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url === "/api/ask-master/quota") return Response.json({ questionsLeft: remaining });
    if (url.startsWith("/api/explorer?") || url.startsWith("/api/xd-database/")) return new Response(null, { status: 503 });
    assert.equal(url, "/api/ask-master");
    return post(init);
  });
}

test("shows a mobile sign-in prompt with a Studio return link and closes on Escape", () => {
  open({ signedIn: false, isMobile: true });
  assert.equal(screen.getByRole("dialog", { name: "Pergunte ao Mestre" }).getAttribute("aria-modal"), "true");
  assert.ok(screen.getByText("Entre para perguntar ao Mestre"));
  assert.equal(screen.getByRole("link", { name: "Entrar" }).getAttribute("href"), "/login?next=%2Fstudio");
  assert.equal(screen.queryByRole("textbox"), null);
  fireEvent.keyDown(window, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
});

test("streams plain paragraphs and bold, sends the active line, and keeps the conversation on close", async (t) => {
  const chess = new Chess();
  const move = chess.move("d4");
  const fen = chess.fen();
  const board = initial.active();
  useStudioStore.setState({
    boards: [{ ...board, path: [1], tree: { ...board.tree, children: [
      { id: "other", san: "e4", uci: "e2e4", fen: "", from: "e2", to: "e4", children: [] },
      { id: "active", san: move.san, uci: "d2d4", fen, from: move.from, to: move.to, children: [] },
    ] } }],
  });
  const bodies: Record<string, unknown>[] = [];
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const fetch = mockApi(t, (init) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } }));
  });
  open();
  await screen.findByText("3 perguntas restantes hoje");
  assert.ok(screen.getByText("As respostas vêm de uma IA e podem conter erros. Não escreva dados pessoais."));
  ask();
  assert.ok((screen.getByRole("button", { name: "Enviar" }) as HTMLButtonElement).disabled);
  assert.ok(screen.getByText("Analisando a posição…"));
  assert.equal(bodies.length, 0);
  await screen.findByText("O Mestre está respondendo…");
  const pack = bodies[0].context as { fen: string; moves: string[]; opening: { name: string }; facts: unknown };
  assert.equal(pack.fen, fen);
  assert.deepEqual(pack.moves, ["d4"]);
  assert.match(pack.opening.name, /Queen's Pawn/);
  assert.ok(pack.facts);
  assert.equal(bodies[0].locale, "pt-br");

  const encoder = new TextEncoder();
  const bytes = encoder.encode("Jogue **no centro**.\n\n<a>Peão</a>");
  const split = bytes.indexOf(0xc3) + 1;
  await act(async () => stream.enqueue(bytes.subarray(0, split)));
  assert.equal(screen.getByText("no centro").tagName, "STRONG");
  await act(async () => {
    stream.enqueue(bytes.subarray(split));
    stream.close();
  });
  assert.equal(screen.getByText("<a>Peão</a>").tagName, "P");
  assert.equal(screen.queryByRole("link"), null);
  assert.equal(fetch.mock.calls.filter((call) => call.arguments[0] === "/api/ask-master/quota").length, 2);

  fireEvent.keyDown(window, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
  fireEvent.click(screen.getByRole("button", { name: "Pergunte ao Mestre" }));
  assert.ok(screen.getByText("Qual é o plano?"));
  await screen.findByText("3 perguntas restantes hoje");
  ask("E depois?");
  await screen.findByText("O Mestre está respondendo…");
  assert.equal(bodies[1].conversationId, bodies[0].conversationId);
  assert.deepEqual(bodies[1].history, [
    { role: "user", text: "Qual é o plano?" },
    { role: "assistant", text: "Jogue **no centro**.\n\n<a>Peão</a>" },
  ]);
  await act(async () => stream.close());
});

for (const [body, message] of [
  [{ error: "rate_limit" }, "Muitas perguntas seguidas. Aguarde um minuto."],
  [{ error: "quota", reason: "site_limit" }, "O Mestre atingiu o limite de hoje. Volte amanhã."],
  [{ error: "quota", reason: "user_limit" }, "Você usou suas perguntas de hoje. Volte amanhã."],
] as const) {
  test(`shows the localized message for ${"reason" in body ? body.reason : body.error}`, async (t) => {
    mockApi(t, () => Response.json(body, { status: 429 }));
    open();
    await screen.findByText("3 perguntas restantes hoje");
    ask();
    await screen.findByText(message);
    if ("reason" in body && body.reason === "user_limit") {
      await screen.findByText("0 perguntas restantes hoje");
      ask("Outra pergunta");
      assert.ok((screen.getByRole("button", { name: "Enviar" }) as HTMLButtonElement).disabled);
    }
  });
}

test("new question aborts and clears the chat, and Escape aborts the next answer", async (t) => {
  const requests: { signal: AbortSignal; conversationId: string; history: unknown[] }[] = [];
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  mockApi(t, (init) => {
    requests.push({ ...JSON.parse(String(init.body)), signal: init.signal });
    return new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } }));
  });
  open();
  await screen.findByText("3 perguntas restantes hoje");
  ask();
  await screen.findByText("O Mestre está respondendo…");
  const firstStream = stream;
  await act(async () => firstStream.enqueue(new TextEncoder().encode("Resposta parcial")));
  assert.ok(screen.getByText("Resposta parcial"));
  fireEvent.click(screen.getByRole("button", { name: "Nova pergunta" }));
  assert.ok(requests[0].signal.aborted);
  assert.equal(screen.queryByText("Resposta parcial"), null);
  assert.equal(screen.queryByText("Qual é o plano?"), null);
  await act(async () => {
    firstStream.enqueue(new TextEncoder().encode("Resposta antiga"));
    firstStream.close();
  });
  assert.equal(screen.queryByText("Resposta antiga"), null);

  ask("Outra pergunta");
  await screen.findByText("O Mestre está respondendo…");
  assert.notEqual(requests[0].conversationId, requests[1].conversationId);
  assert.deepEqual(requests[1].history, []);
  fireEvent.keyDown(window, { key: "Escape" });
  assert.ok(requests[1].signal.aborted);
  assert.equal(screen.queryByRole("dialog"), null);
  await act(async () => stream.close());
});

test("hides the launcher and closes the window in board-covering views", async (t) => {
  mockApi(t, () => Response.json({}));
  const { rerender } = open();
  await screen.findByText("3 perguntas restantes hoje");
  rerender(<AskMasterWidget visible={false} isMobile={false} />);
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(screen.queryByRole("button", { name: "Pergunte ao Mestre" }), null);
  rerender(<AskMasterWidget visible isMobile={false} />);
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
});
