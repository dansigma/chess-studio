import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { computePositionFacts, computeThreats, computeThreatsToMove } from "../../src/chess/facts/index.ts";
import { buildPositionPack } from "../../src/lib/ask-master/position-pack.ts";
import { buildMessages } from "../../src/lib/ask-master/prompt.ts";
import { askMasterProviderConfig, parseRequestOptions } from "../../src/lib/ask-master/provider.ts";
import { indexCatalogOpenings, resolveLineOpening } from "../../src/lib/line-opening.ts";
import { loadCatalog } from "../../src/lib/openings-catalog.ts";
import { renderReport } from "./compare.mjs";
import { parseJsonl, replayItem, validateItems } from "./schema.mjs";
import { buildJudgeMessages, parseJudgeReply, scoreAnswer } from "./score.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");

function buildContext(item, openings) {
  const { fen, level, sanLine = [], engineLines, lichess, xd, xdGames } = item;
  const lineFens = replayItem(item);
  return buildPositionPack({
    fen, level, sanLine, startFen: lineFens[0], engineLines, lichess, xd, xdGames,
    opening: resolveLineOpening(lineFens, openings) ?? xd?.opening ?? lichess?.opening,
    facts: computePositionFacts(fen),
    threats: [computeThreatsToMove(fen), computeThreats(fen)],
  });
}

async function complete({ baseUrl, apiKey }, model, messages, fetchProvider, options) {
  const response = await fetchProvider(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "xadrez-digital-ask-master/1.0",
      "x-opencode-session": randomUUID(),
      "HTTP-Referer": "https://xadrez.digital",
      "X-Title": "Xadrez Digital",
    },
    body: JSON.stringify({ ...options, model, messages, stream: false }),
    signal: AbortSignal.timeout(180_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = (await response.json())?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Resposta vazia do provedor");
  return text;
}

async function timedComplete(config, model, messages, fetchProvider, options) {
  const start = performance.now();
  try {
    return { text: await complete(config, model, messages, fetchProvider, options), ms: Math.round(performance.now() - start) };
  } catch (error) {
    // Keep credentials, URLs and provider response bodies out of reports.
    const message = /^HTTP \d{3}$/.test(error?.message) ? error.message : "Falha na resposta do provedor";
    return { error: message, ms: Math.round(performance.now() - start) };
  }
}

export async function runEvaluation({
  input, outDir, config, judgeModel = config.model, judgeOptions = config.options, fetchProvider = fetch, onPosition,
}) {
  const source = await readFile(input, "utf8");
  const items = parseJsonl(source, input);
  const { ok, errors } = validateItems(items);
  if (!ok) throw new Error(errors.join("\n"));
  const openings = indexCatalogOpenings(await loadCatalog());
  const report = {
    version: 1,
    model: config.model,
    options: config.options ?? null,
    judgeModel,
    judgeOptions: judgeOptions ?? null,
    startedAt: new Date().toISOString(),
    datasetHash: hash(source),
    positions: [],
  };
  for (const item of items) {
    const context = buildContext(item, openings);
    const messages = buildMessages({ ...item, context, history: [] });
    const answer = await timedComplete(config, config.model, messages, fetchProvider, config.options);
    const score = answer.error ? null : scoreAnswer(answer.text, item.fen, context);
    const judge = score
      ? await timedComplete(config, judgeModel, buildJudgeMessages(item, score.body), fetchProvider, judgeOptions)
      : null;
    const judgement = parseJudgeReply(judge?.text, item, score?.body ?? "");
    const judgeError = judge?.error ?? (judge && judgement.mustMention[0].verdict === "unknown"
      ? "JSON do juiz inválido" : null);
    const row = {
      id: item.id, fen: item.fen, question: item.question, level: item.level, intent: item.intent,
      locale: item.locale, itemHash: hash(JSON.stringify(item)), context,
      answerMs: answer.ms, judgeMs: judge?.ms ?? null,
      error: answer.error ?? null,
      judgeError,
      score, judgement,
    };
    report.positions.push(row);
    onPosition?.(row, report.positions.length, items.length);
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(join(outDir, "report.md"), renderReport(report));
  return report;
}

async function main(args) {
  const { values } = parseArgs({ args, options: {
    input: { type: "string", default: "ask-master-eval-data/items.jsonl" },
    out: { type: "string", default: "ask-master-eval-out" },
  } });
  const config = askMasterProviderConfig();
  if (!config) throw new Error("Defina ASK_MASTER_BASE_URL, ASK_MASTER_MODEL e ASK_MASTER_API_KEY.");
  const report = await runEvaluation({
    input: values.input,
    outDir: values.out,
    config,
    judgeModel: process.env.ASK_MASTER_EVAL_JUDGE_MODEL?.trim() || config.model,
    // The judge reuses the answer options unless its own are set, even when it keeps the same model.
    ...(process.env.ASK_MASTER_EVAL_JUDGE_OPTIONS?.trim()
      ? { judgeOptions: parseRequestOptions(process.env.ASK_MASTER_EVAL_JUDGE_OPTIONS, "ASK_MASTER_EVAL_JUDGE_OPTIONS") } : {}),
    onPosition: (row, index, total) => console.error(`[${index}/${total}] ${row.id}${row.error ? ` (${row.error})` : ""}`),
  });
  console.log(`Relatórios em ${values.out}`);
  if (report.positions.some((row) => row.error || row.judgeError)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
