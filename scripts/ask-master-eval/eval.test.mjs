import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compareReports } from "./compare.mjs";
import { runEvaluation } from "./run.mjs";
import { parseJsonl, validateItems } from "./schema.mjs";
import { parseJudgeReply, scoreAnswer } from "./score.mjs";

const input = new URL("./fixtures/items.jsonl", import.meta.url);
const items = parseJsonl(await readFile(input, "utf8"));
const [opening] = items;
const answer = "Bb5 ataca Nc6.";
const judge = {
  mustMention: [{ verdict: "yes", quote: answer }, { verdict: "no", quote: null }, { verdict: "no", quote: null }],
  mustNotClaim: [{ verdict: "no", quote: null }],
};

test("schema accepts fixtures and rejects invalid history, options and duplicate ids", () => {
  assert.deepEqual(validateItems(items), { ok: true, errors: [] });
  assert.throws(() => parseJsonl("\n{oops}", "test"), /test:2/);
  const invalid = validateItems([opening, {
    ...opening, sanLine: ["e4"], level: "beginner", locale: "pt-BR",
    intent: "review", mustMention: ["one"], mustNotClaim: [false], engineLines: [{}], xd: {}, xdGames: [{}],
  }]);
  assert.equal(invalid.ok, false);
  for (const field of ["duplicate id", "sanLine", "level", "locale", "intent", "mustMention", "mustNotClaim", "engineLines", "xd ", "xdGames"]) {
    assert.ok(invalid.errors.some((error) => error.includes(field)), field);
  }
  assert.equal(validateItems([{ ...opening, fen: "bad" }]).ok, false);
});

test("deterministic scoring audits claims and handles legal, illegal and unresolved lines", () => {
  const body = "Try [[1.e4 e5]] or [[3...a6]]. Avoid [[3...Bh8]] and [[12.Nf3]]. +0.8, -0,4 and 25%. {{game:+1.2}}";
  const claims = [{ type: "attacks", piece: "Bb5", target: "c6" }, { type: "hanging", piece: "Qg3" }];
  const score = scoreAnswer(`${body}<claims>${JSON.stringify(claims)}</claims>`, opening.fen, { moves: opening.sanLine });
  assert.deepEqual(score.illegalLines, ["3...Bh8", "12.Nf3"]);
  assert.equal(score.illegalLineCount, 2);
  assert.equal(score.falseClaimCount, 1);
  assert.deepEqual(score.falseClaims[0].claim, claims[1]);
  assert.equal(score.figureCount, 3);
  assert.equal(score.answerChars, body.length);
});

test("judge accepts exact evidence and marks malformed replies unknown", () => {
  const parsed = parseJudgeReply(JSON.stringify(judge), opening, answer);
  assert.deepEqual(parsed.mustMention[0], { point: opening.mustMention[0], verdict: "yes", quote: answer });
  assert.equal(parsed.mustNotClaim[0].verdict, "no");
  for (const reply of ["not JSON", "null", "{}", JSON.stringify({ ...judge, mustNotClaim: [] }),
    JSON.stringify({ ...judge, mustMention: [{ verdict: "yes", quote: "invented evidence" }, ...judge.mustMention.slice(1)] })]) {
    const result = parseJudgeReply(reply, opening, answer);
    assert.ok(Object.values(result).flat().every(({ verdict, quote }) => verdict === "unknown" && quote === null));
  }
});

test("runner sends production context, writes both reports and continues after provider failure", async (t) => {
  const outDir = await mkdtemp(join(tmpdir(), "ask-master-eval-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const requests = [];
  const report = await runEvaluation({
    input, outDir, config: { baseUrl: "https://example.invalid/v1/", apiKey: "fake", model: "coach" },
    judgeModel: "judge",
    fetchProvider: async (url, options) => {
      assert.equal(url, "https://example.invalid/v1/chat/completions");
      assert.equal(options.headers["User-Agent"], "xadrez-digital-ask-master/1.0");
      assert.match(options.headers["x-opencode-session"], /^[a-f0-9-]{36}$/);
      const payload = JSON.parse(options.body);
      assert.equal(payload.stream, false);
      requests.push(payload);
      const index = requests.length;
      if (index === 3) return new Response(null, { status: 429 });
      const content = index === 2 ? JSON.stringify(judge) : index === 5 ? "invalid" : `${answer}<claims>[]</claims>`;
      return Response.json({ choices: [{ message: { content } }] });
    },
  });
  assert.deepEqual(requests.map(({ model }) => model), ["coach", "judge", "coach", "coach", "judge"]);
  assert.match(requests[0].messages[0].content, /Brazilian Portuguese/);
  assert.match(requests[0].messages[1].content, /Ruy Lopez/);
  assert.equal(requests[0].messages.at(-1).content, opening.question);
  assert.equal(JSON.parse(requests[1].messages[1].content).answer, answer);
  assert.equal(report.positions[0].judgement.mustMention[0].verdict, "yes");
  assert.equal(report.positions[1].error, "HTTP 429");
  assert.equal(report.positions[2].judgeError, "JSON do juiz inválido");
  assert.deepEqual(JSON.parse(await readFile(join(outDir, "report.json"), "utf8")), JSON.parse(JSON.stringify(report)));
  const markdown = await readFile(join(outDir, "report.md"), "utf8");
  assert.match(markdown, /fixture-opening.*Bb5 ataca Nc6/);
  const comparison = compareReports(report, { ...report, model: "other", datasetHash: "other", positions: [
    { ...report.positions[0], itemHash: "other" },
  ] });
  assert.match(comparison, /A · coach .*B · other/);
  assert.match(comparison, /fixture-opening \(item alterado\)/);
  assert.match(comparison, /fixture-middlegame.*HTTP 429.*ausente/);
  assert.match(comparison, /arquivos de entrada diferem/);
});
