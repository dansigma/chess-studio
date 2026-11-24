import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test, type TestContext } from "node:test";
import { teardownDom } from "@/src/test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Chess } from "chess.js";
import { useStudioStore } from "@/src/store/studio-store.ts";
import { bookKey } from "@/src/chess/opening-book";
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
    if (url === "/api/ask-master/conversations") return Response.json({ conversations: [] });
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
  assert.equal(screen.queryByRole("button", { name: "Histórico" }), null);
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
  const level = screen.getByRole<HTMLSelectElement>("combobox", { name: "Nível do jogador" });
  assert.equal(level.value, "1600-2000");
  assert.deepEqual([...level.options].map((option) => option.text), ["Até 1600", "1600–2000", "2000+"]);
  fireEvent.change(level, { target: { value: "u1600" } });
  assert.equal(useStudioStore.getState().settings.askMasterLevel, "u1600");
  ask();
  assert.ok((screen.getByRole("button", { name: "Enviar" }) as HTMLButtonElement).disabled);
  assert.ok(screen.getByText("Analisando a posição…"));
  assert.equal(bodies.length, 0);
  await screen.findByText("O Mestre está respondendo…");
  const pack = bodies[0].context as { fen: string; moves: string[]; opening: { name: string }; facts: unknown; level: string };
  assert.equal(pack.fen, fen);
  assert.equal(bodies[0].level, "u1600");
  assert.equal(pack.level, "u1600");
  assert.deepEqual(pack.moves, ["d4"]);
  assert.match(pack.opening.name, /Queen's Pawn/);
  assert.ok(pack.facts);
  assert.equal(bodies[0].locale, "pt-br");
  assert.equal(bodies[0].intent, "free");

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

test("previews and plays answer variations from the question's line", async (t) => {
  const state = useStudioStore.getState();
  state.playUciSequence(["e2e4", "e7e5"]);
  const original = state.active().tree.children[0];
  const questionFen = state.fen();
  useStudioStore.setState({ settings: { ...state.settings, moveNotation: "unicode" } });
  mockApi(t, () => new Response("Jogue [[1...c5 2.Nf3 d6]]. Evite [[2.Bh8]]."));
  open();
  await screen.findByText("3 perguntas restantes hoje");
  ask();

  const knight = await screen.findByRole("button", { name: "2.♘f3" });
  assert.match(screen.getByRole("log").textContent ?? "", /Evite 2\.Bh8\./);
  assert.equal(screen.queryByRole("button", { name: /Bh8/ }), null);

  fireEvent.mouseEnter(knight);
  assert.equal(useStudioStore.getState().enginePreview?.fen, original.fen);
  assert.deepEqual(useStudioStore.getState().insightMarks?.marks.arrows, [
    { from: "c7", to: "c5", color: "G" },
  ]);
  assert.equal(state.fen(), questionFen);
  fireEvent.mouseLeave(knight);
  assert.equal(useStudioStore.getState().enginePreview, null);
  assert.equal(useStudioStore.getState().insightMarks, null);

  fireEvent.click(knight);
  const branch = state.active().tree.children[0];
  assert.deepEqual(branch.children[0], original.children[0]);
  assert.equal(branch.children[1].san, "c5");
  assert.equal(branch.children[1].children[0].children[0].san, "d6");
  assert.deepEqual(state.active().path, [0, 1, 0]);
  assert.ok(screen.getByRole("dialog"));

  const inserted = state.active().tree;
  fireEvent.click(screen.getByRole("button", { name: "1...c5" }));
  assert.deepEqual(state.active().path, [0, 1]);
  assert.equal(state.active().tree, inserted);
});

test("history tabs query the game and position, reopen a transcript, and continue its ID", async (t) => {
  const chess = new Chess();
  const startFen = chess.fen();
  const { from, to, san } = chess.move("Nf3");
  const fen = chess.fen();
  const board = initial.active();
  useStudioStore.setState({ boards: [{
    ...board, title: "Minha partida", path: [0],
    tree: { startFen, children: [{ id: "move", from, to, san, uci: from + to, fen, children: [] }] },
  }] });
  const positionKey = bookKey(fen).toString();
  const rows = [{
    id: crypto.randomUUID(), positionKey, updatedAt: "2026-11-23T19:15:00Z", gameTitle: "Partida de ontem",
    firstQuestion: "Por que Nf3?", messageCount: 2, model: "modelo",
  }];
  const messages = [
    { role: "user", text: "Por que Nf3?" },
    { role: "assistant", text: "Para desenvolver o cavalo." },
  ];
  const lists: string[][] = [];
  const sends: Record<string, unknown>[] = [];
  let firstSignal: AbortSignal | null | undefined;
  let firstStream!: ReadableStreamDefaultController<Uint8Array>;
  const endpoint = "/api/ask-master/conversations";
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url === "/api/ask-master/quota") return Response.json({ questionsLeft: 3 });
    if (url === endpoint) {
      lists.push(JSON.parse(String(init.body)).positionKeys);
      return Response.json({ conversations: rows });
    }
    if (url === `${endpoint}?id=${rows[0].id}`) return Response.json({ ...rows[0], messages });
    assert.equal(url, "/api/ask-master");
    sends.push(JSON.parse(String(init.body)));
    if (sends.length === 1) {
      firstSignal = init.signal;
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { firstStream = controller; } }));
    }
    return new Response("Centralize as peças.");
  });
  open({ isMobile: true });
  await screen.findByText("3 perguntas restantes hoje");
  ask("Pergunta em andamento");
  fireEvent.click(screen.getByRole("button", { name: /^Histórico/ }));
  const panel = screen.getByRole("tabpanel", { name: "Nesta partida" });
  await within(panel).findByText("Por que Nf3?");
  assert.ok(within(panel).getByText("Partida de ontem"));
  assert.ok(within(panel).getByText("2 mensagens · modelo"));
  assert.equal(panel.querySelector("time")?.dateTime, rows[0].updatedAt);
  fireEvent.click(screen.getByRole("tab", { name: "Nesta posição" }));
  const position = screen.getByRole("tabpanel", { name: "Nesta posição" });
  fireEvent.click(await within(position).findByRole("button", { name: "Abrir" }));
  await within(await screen.findByRole("log")).findByText("Para desenvolver o cavalo.");
  assert.ok(firstSignal?.aborted);
  await act(async () => firstStream.close());
  assert.equal(screen.queryByText("Pergunta em andamento"), null);
  ask("E agora?");
  await screen.findByText("Centralize as peças.");
  assert.deepEqual(lists.slice(0, 2), [[bookKey(startFen).toString(), positionKey], [positionKey]]);
  assert.equal(sends[1].conversationId, rows[0].id);
  assert.equal(sends[1].gameTitle, "Minha partida");
  assert.deepEqual(sends[1].history, messages);
});

test("deletion requires confirmation and removes the saved row without another list request", async (t) => {
  const row = {
    id: crypto.randomUUID(), updatedAt: "2026-11-23T19:15:00Z", firstQuestion: "Pergunta salva",
    messageCount: 2, model: "modelo",
  };
  const fetch = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url === "/api/ask-master/quota") return Response.json({ questionsLeft: 3 });
    if (init.method === "POST") return Response.json({ conversations: [row] });
    assert.equal(url, `/api/ask-master/conversations?id=${row.id}`);
    assert.equal(init.method, "DELETE");
    return new Response(null, { status: 204 });
  });
  const deletes = () => fetch.mock.calls.filter(({ arguments: [, init] }) => init?.method === "DELETE").length;
  open({ isMobile: true });
  fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
  const remove = await screen.findByRole("button", { name: "Excluir" });
  fireEvent.click(remove);
  let dialog = screen.getByRole("dialog", { name: "Excluir esta conversa?" });
  const dialogButtons = within(dialog).getAllByRole("button");
  // Happy DOM has no layout, so mark the confirmation buttons as visible to the focus trap.
  const sheet = screen.getByRole("dialog", { name: "Pergunte ao Mestre" });
  const sheetClose = within(sheet).getAllByRole("button")[0];
  Object.defineProperty(sheetClose, "offsetParent", { value: sheet });
  for (const button of dialogButtons) Object.defineProperty(button, "offsetParent", { value: dialog });
  const last = dialogButtons.at(-1)!;
  last.focus();
  fireEvent.keyDown(last, { key: "Tab" });
  assert.equal(document.activeElement, dialogButtons[0]);
  fireEvent.keyDown(window, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog", { name: "Excluir esta conversa?" }), null);
  assert.ok(screen.getByRole("dialog", { name: "Pergunte ao Mestre" }));
  assert.equal(deletes(), 0);
  fireEvent.click(remove);
  dialog = screen.getByRole("dialog", { name: "Excluir esta conversa?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));
  await screen.findByText("Nenhuma conversa salva.");
  assert.equal(deletes(), 1);
  assert.equal(screen.queryByText("Pergunta salva"), null);
  assert.equal(fetch.mock.calls.filter(({ arguments: [, init] }) => init?.method === "POST").length, 1);
});

test("checks the position dot only while open, debounces navigation and aborts stale lookups", async (t) => {
  const board = initial.active();
  const chess = new Chess(board.tree.startFen);
  const { from, to, san } = chess.move("Nf3");
  const fen = chess.fen();
  const tree = { ...board.tree, children: [{ id: "move", from, to, san, uci: from + to, fen, children: [] }] };
  useStudioStore.setState({ user: { id: "user", email: null, displayName: null }, boards: [{ ...board, tree }] });
  const requests: { keys: string[]; signal: AbortSignal | null | undefined }[] = [];
  const stale = Promise.withResolvers<Response>();
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url === "/api/ask-master/quota") return Response.json({ questionsLeft: 3 });
    assert.equal(url, "/api/ask-master/conversations");
    const keys = JSON.parse(String(init.body)).positionKeys;
    requests.push({ keys, signal: init.signal });
    return requests.length === 2 ? stale.promise : Response.json({ conversations: [{}] });
  });
  render(<AskMasterWidget visible isMobile={false} />);
  const launcher = screen.getByRole("button", { name: "Pergunte ao Mestre" });
  const dot = "Conversas salvas nesta posição";
  assert.equal(requests.length, 0);
  fireEvent.click(launcher);
  assert.equal(requests.length, 0);
  await screen.findByRole("img", { name: dot }, { timeout: 2000 });
  assert.deepEqual(requests[0].keys, [bookKey(tree.startFen).toString()]);
  act(() => useStudioStore.setState({ boards: [{ ...board, tree, path: [0] }] }));
  assert.equal(screen.queryByRole("img", { name: dot }), null);
  assert.equal(requests.length, 1);
  await waitFor(() => assert.equal(requests.length, 2), { timeout: 2000 });
  assert.deepEqual(requests[1].keys, [bookKey(fen).toString()]);
  fireEvent.click(launcher);
  assert.equal(requests[1].signal?.aborted, true);
  await act(async () => stale.resolve(Response.json({ conversations: [{}] })));
  assert.equal(screen.queryByRole("img", { name: dot }), null);
});

test("shows two starters at the starting position and updates them when Black is to move in a known opening", async (t) => {
  mockApi(t, () => new Response("Answer"));
  const chess = new Chess();
  const board = initial.active();
  open();
  await screen.findByText("3 perguntas restantes hoje");
  assert.ok(screen.getByRole("button", { name: "Explique esta posição e o plano das brancas" }));
  assert.ok(screen.getByRole("button", { name: "Quais são as partidas modelo desta linha?" }));
  assert.equal(screen.queryByRole("button", { name: /^Por onde começo a estudar/ }), null);

  const move = chess.move("d4");
  await act(async () => {
    useStudioStore.setState({
      boards: [{ ...board, path: [0], tree: { ...board.tree, children: [
        { id: "d4", san: move.san, uci: "d2d4", fen: chess.fen(), from: move.from, to: move.to, children: [] },
      ] } }],
    });
  });
  assert.ok(screen.getByRole("button", { name: "Explique esta posição e o plano das pretas" }));
  assert.match((await screen.findByRole("button", { name: /^Por onde começo a estudar/ })).textContent ?? "", /Peão/);
});

test("each starter sends its intent and headings render safely on their own lines", async (t) => {
  const chess = new Chess();
  const move = chess.move("d4");
  const board = initial.active();
  useStudioStore.setState({
    boards: [{ ...board, path: [0], tree: { ...board.tree, children: [
      { id: "d4", san: move.san, uci: "d2d4", fen: chess.fen(), from: move.from, to: move.to, children: [] },
    ] } }],
  });
  const bodies: { question: string; intent: string }[] = [];
  mockApi(t, (init) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response("### Conclusão\r\nJogue **no centro**.\n**<a>O plano</a>**\nAvance o peão.");
  });
  open();
  await screen.findByText("3 perguntas restantes hoje");
  for (const [name, intent] of [
    [/^Explique esta posição/, "explain"],
    [/^Quais são as partidas modelo/, "model-games"],
    [/^Por onde começo a estudar/, "study-opening"],
  ] as const) {
    const starter = await screen.findByRole("button", { name });
    const question = starter.textContent;
    fireEvent.click(starter);
    await screen.findByRole("heading", { name: "Conclusão" });
    assert.equal(screen.getByRole("heading", { name: "<a>O plano</a>" }).tagName, "H3");
    assert.equal(screen.getByText("no centro").tagName, "STRONG");
    assert.equal(screen.queryByRole("link"), null);
    assert.equal(screen.queryByRole("button", { name }), null);
    assert.equal(bodies.at(-1)?.question, question);
    assert.equal(bodies.at(-1)?.intent, intent);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nova pergunta" })));
  }
});

test("opens only games from the question's pack in a new board at the question FEN", async (t) => {
  const state = useStudioStore.getState();
  t.after(() => useStudioStore.setState({
    activeBoardId: initial.activeBoardId, boards: initial.boards, statusMessage: null,
  }));
  useStudioStore.setState({ settings: { ...state.settings, gamePreviewEnabled: true } });
  state.playUciSequence(["e2e4", "e7e5"]);
  const questionFen = state.fen();
  const sourceBoardId = state.active().id;
  const gameRequest = Promise.withResolvers<Response>();
  const fetch = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url === "/api/ask-master/quota") return Response.json({ questionsLeft: 3 });
    if (url.startsWith("/api/xd-database/games?")) {
      return Response.json({
        games: [{ id: 42, white: "Short", black: "Van der Wiel", date: "2002.05.04", result: "1-0" }],
        nextCursor: null,
      });
    }
    if (url === "/api/xd-database/game/42") return gameRequest.promise;
    if (url.startsWith("/api/explorer?") || url.startsWith("/api/xd-database/tree?")) {
      return new Response(null, { status: 503 });
    }
    assert.equal(url, "/api/ask-master");
    const { context } = JSON.parse(String(init.body));
    assert.equal(context.fen, questionFen);
    assert.deepEqual(context.xdGames.map(({ id }: { id: string }) => id), ["42"]);
    return new Response("Veja {{game:42}}. Outro exemplo {{game:99}}.");
  });

  open();
  await screen.findByText("3 perguntas restantes hoje");
  ask();
  const chip = await screen.findByRole("button", { name: "Short – Van der Wiel, 2002" });
  assert.match(screen.getByRole("log").textContent ?? "", /Outro exemplo \./);
  assert.doesNotMatch(screen.getByRole("log").textContent ?? "", /\{\{game:/);

  await act(async () => state.playUciSequence(["g1f3"]));
  const laterFen = state.fen();
  assert.notEqual(laterFen, questionFen);
  fireEvent.click(chip);
  assert.equal(useStudioStore.getState().statusMessage, "Carregando partida…");
  assert.equal(state.active().id, sourceBoardId);
  await act(async () => gameRequest.resolve(new Response("1. e4 e5 2. Nf3 Nc6 *")));

  assert.notEqual(state.active().id, sourceBoardId);
  assert.equal(state.active().preview, false);
  assert.equal(state.active().title, "Short – Van der Wiel, 2002");
  assert.equal(state.fen(), questionFen);
  assert.deepEqual(state.active().path, [0, 0]);
  assert.equal(useStudioStore.getState().boards.length, initial.boards.length + 1);
  assert.equal(useStudioStore.getState().boards.find(({ id }) => id === sourceBoardId)?.path.length, 3);
  assert.equal(useStudioStore.getState().statusMessage, null);
  const gameUrls = fetch.mock.calls.map(({ arguments: [url] }) => String(url))
    .filter((url) => url.startsWith("/api/xd-database/game/"));
  assert.deepEqual(gameUrls, ["/api/xd-database/game/42"]);
});
