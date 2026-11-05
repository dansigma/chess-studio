// SIG-1221: score the fact extractor and template explainer on a validation set.
//
//   node --import ./scripts/test-resolve.mjs scripts/valset/run.mjs \
//        valset-data/items.truth.jsonl [--split dev|holdout|all] [--i-know] \
//        [--lock valset-data/holdout.lock.json] [--out valset-out]
//
// Writes <out>/report.md and <out>/report.json (report.<split>.* for holdout/all).
// The holdout is the final exam: it needs --i-know, and so does `all` (it includes it).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { buildReport, renderMarkdown } from "./metrics.mjs";
import { parseJsonl, validateItems } from "./schema.mjs";
import { applyLock, loadLock } from "./split.mjs";

export function selectSplit(items, { split, iKnow, lockPath }) {
  if (!["dev", "holdout", "all"].includes(split)) {
    throw new Error(`--split must be dev, holdout or all (got "${split}")`);
  }
  if ((split === "holdout" || split === "all") && !iKnow) {
    throw new Error(`--split ${split} touches the locked holdout. Re-run with --i-know if this is the final measurement.`);
  }
  const hasLock = lockPath && existsSync(lockPath);
  if (!hasLock) {
    if (split === "holdout") {
      throw new Error(`no holdout lock at ${lockPath}; run split.mjs first`);
    }
    return { items, note: split === "dev" ? "no holdout lock found: every item counts as dev" : null };
  }
  const applied = applyLock(items, loadLock(lockPath));
  return { items: split === "dev" ? applied.dev : split === "holdout" ? applied.holdout : items, note: null };
}

export function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      split: { type: "string", default: "dev" },
      "i-know": { type: "boolean", default: false },
      lock: { type: "string", default: "valset-data/holdout.lock.json" },
      out: { type: "string", default: "valset-out" },
    },
  });
  if (positionals.length !== 1) {
    console.error("usage: run.mjs <items.truth.jsonl> [--split dev|holdout|all] [--i-know] [--lock file] [--out dir]");
    return 2;
  }
  try {
    const all = parseJsonl(readFileSync(positionals[0], "utf8"), positionals[0]);
    const check = validateItems(all);
    if (!check.ok) {
      console.error(check.errors.join("\n"));
      return 1;
    }
    const selected = selectSplit(all, { split: values.split, iKnow: values["i-know"], lockPath: values.lock });
    if (selected.note) console.error(`note: ${selected.note}`);
    const withoutEngine = selected.items.filter((item) => !item.engine).length;
    if (withoutEngine > 0) {
      console.error(`note: ${withoutEngine} item(s) have no engine ground truth (run ground-truth.mjs first); engine-based checks skip them`);
    }
    const report = buildReport(selected.items, { split: values.split });
    mkdirSync(values.out, { recursive: true });
    const suffix = values.split === "dev" ? "" : `.${values.split}`;
    writeFileSync(join(values.out, `report${suffix}.md`), renderMarkdown(report));
    writeFileSync(join(values.out, `report${suffix}.json`), `${JSON.stringify(report, null, 1)}\n`);
    console.log(`wrote ${join(values.out, `report${suffix}.md`)} (recall ${report.overall.hit}/${report.overall.labelled}, ${report.explainer.contradictions.length} contradiction(s))`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
