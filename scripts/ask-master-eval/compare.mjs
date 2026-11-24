import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const cell = (text) => String(text).replace(/[\\|`*_~<>\[\]&]/g, (char) => `\\${char}`).replace(/\r?\n/g, " ");
const table = (headers, rows) => [headers, headers.map(() => "---"), ...rows]
  .map((row) => `| ${row.map(cell).join(" | ")} |`).join("\n");

function verdicts(entries, evidence = false) {
  return entries.map(({ point, verdict, quote }) =>
    `${verdict}: ${point}${evidence && quote ? ` (“${quote}”)` : ""}`).join("; ") || "—";
}

function metrics(row) {
  if (row.error) return `Falha após ${row.answerMs} ms: ${row.error}`;
  const { illegalLineCount, falseClaimCount, figureCount, answerChars } = row.score;
  return `${illegalLineCount} inválidas / ${falseClaimCount} rejeitadas / ${figureCount} números / ${answerChars} caracteres / ${row.answerMs} ms`;
}

function totals({ positions }) {
  const rows = [
    ["Posições com resposta", `${positions.filter((row) => row.score).length}/${positions.length}`],
  ];
  for (const [key, label] of [["mustMention", "Pontos cobertos"], ["mustNotClaim", "Afirmações proibidas presentes"]]) {
    const entries = positions.flatMap((row) => row.judgement[key]);
    const count = (verdict) => entries.filter((entry) => entry.verdict === verdict).length;
    rows.push([label, `${count("yes")}/${entries.length} (${count("unknown")} desconhecidos)`]);
  }
  for (const [key, label] of [
    ["illegalLineCount", "Variantes inválidas"],
    ["falseClaimCount", "Afirmações rejeitadas pela auditoria"],
    ["figureCount", "Avaliações e percentuais"],
  ]) rows.push([label, positions.reduce((sum, row) => sum + (row.score?.[key] ?? 0), 0)]);
  const successful = positions.filter((row) => row.score);
  const average = (get) => successful.length
    ? Math.round(successful.reduce((sum, row) => sum + get(row), 0) / successful.length)
    : "—";
  rows.push(["Latência média da resposta (ms)", average((row) => row.answerMs)]);
  rows.push(["Comprimento médio (caracteres)", average((row) => row.score.answerChars)]);
  return rows;
}

export function renderReport(report) {
  return [
    "# Avaliação do Pergunte ao Mestre",
    `Modelo **${cell(report.model)}** · juiz **${cell(report.judgeModel)}** · ${report.startedAt}`,
    table(["Métrica", "Resultado"], totals(report)),
    table(["Posição", "Pontos esperados", "Afirmações proibidas", "Métricas da resposta", "Juiz (ms)"],
      report.positions.map((row) => [
        row.id, verdicts(row.judgement.mustMention, true), verdicts(row.judgement.mustNotClaim, true),
        metrics(row), row.judgeError ? `${row.judgeMs ?? "—"} (${row.judgeError})` : row.judgeMs,
      ])),
  ].join("\n\n") + "\n";
}

export function compareReports(a, b) {
  const label = (side, run) => `${side} · ${run.model} · juiz ${run.judgeModel} · ${run.startedAt}`;
  const rightTotals = new Map(totals(b));
  const byId = (run) => new Map(run.positions.map((row) => [row.id, row]));
  const left = byId(a);
  const right = byId(b);
  const describe = (row, key) => row ? (key ? verdicts(row.judgement[key]) : metrics(row)) : "ausente";
  const rows = [];
  for (const id of new Set([...left.keys(), ...right.keys()])) {
    const before = left.get(id);
    const after = right.get(id);
    const changed = before && after && before.itemHash !== after.itemHash ? " (item alterado)" : "";
    rows.push([`${id}${changed}`, describe(before), describe(after)]);
    for (const [key, criterion] of [["mustMention", "Pontos esperados"], ["mustNotClaim", "Afirmações proibidas"]]) {
      rows.push([`${id} · ${criterion}`, describe(before, key), describe(after, key)]);
    }
  }
  return [
    "# Comparação de avaliações",
    ...(a.datasetHash === b.datasetHash ? [] : ["Os arquivos de entrada diferem entre as execuções."]),
    table(["Métrica", label("A", a), label("B", b)], totals(a).map(([key, value]) => [key, value, rightTotals.get(key)])),
    table(["Posição", "A", "B"], rows),
  ].join("\n\n") + "\n";
}

async function main([flag, a, b, ...rest]) {
  if (flag !== "--compare" || !a || !b || rest.length) {
    throw new Error("Uso: npm run askmaster:compare -- --compare a.json b.json");
  }
  const reports = await Promise.all([a, b].map(async (path) => {
    const report = JSON.parse(await readFile(path, "utf8"));
    if (report?.version !== 1 || !Array.isArray(report.positions)) throw new Error(`Relatório inválido: ${path}`);
    return report;
  }));
  process.stdout.write(compareReports(...reports));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
