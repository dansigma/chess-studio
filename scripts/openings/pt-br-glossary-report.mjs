// SIG-1441: renders docs/opening-names-pt-br-review.md, the reviewable PT-BR
// translation of every opening family and variation part in
// src/data/openings-catalog.json (names are "Family: Part, Part, ...").
// Rows show English → PT-BR with flags for surviving English generic words
// (blocks the script) and for proper-name tokens kept verbatim (informational,
// the glossary rule keeps person names untranslated). Exits non-zero while a
// family is missing from the glossary or any generic word survives.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  findEnglishGenericSurvivors,
  isKnownWord,
  isOverriddenOpeningPart,
  translateFamily,
  translateOpeningPart,
} from "../../src/lib/opening-names-pt-br.ts";

const lines = JSON.parse(readFileSync(new URL("../../src/data/openings-catalog.json", import.meta.url), "utf8"));
const reportPath = new URL("../../docs/opening-names-pt-br-review.md", import.meta.url);

// Name-like tokens only (letters, apostrophes, dots, hyphens): move tokens
// ("Nf6", "a6"), numbers and "4." carry digits and never count as names.
const NAME_LIKE = /^[A-Z][\p{L}’'.-]+$/u;

function keptNameTokens(part) {
  const kept = [];
  for (const token of part.split(/\s+/)) {
    if (!NAME_LIKE.test(token)) continue;
    const segments = token.includes("-") ? token.split("-").filter(Boolean) : [token];
    if (segments.every((segment) => !isKnownWord(segment))) {
      kept.push(token);
    }
  }
  return kept;
}

const familyNames = new Map(); // English family → PT-BR (computed once)
const partRows = new Map(); // English part → { translated, survivors, kept, overridden }
const families = new Map(); // English family → sorted unique parts

for (const { name } of lines) {
  const colon = name.indexOf(":");
  const family = (colon === -1 ? name : name.slice(0, colon)).trim();
  if (!familyNames.has(family)) {
    familyNames.set(family, translateFamily(family));
    families.set(family, new Set());
  }
  if (colon === -1) continue;
  for (const raw of name.slice(colon + 1).split(",")) {
    const part = raw.trim();
    if (!part || families.get(family).has(part)) continue;
    families.get(family).add(part);
    if (!partRows.has(part)) {
      const translated = translateOpeningPart(part);
      partRows.set(part, {
        translated,
        survivors: findEnglishGenericSurvivors(translated),
        kept: keptNameTokens(part),
        overridden: isOverriddenOpeningPart(part),
      });
    }
  }
}

const problems = [];
for (const [family, translation] of familyNames) {
  if (translation === family) {
    problems.push(`FAMÍLIA AUSENTE: ${family}`);
  }
}
let flaggedParts = 0;
let keptParts = 0;
for (const [part, row] of partRows) {
  if (row.survivors.length > 0) flaggedParts++;
  if (row.kept.length > 0) keptParts++;
  for (const survivor of row.survivors) {
    problems.push(`GENÉRICO EM INGLÊS: "${part}" → "${row.translated}" (${survivor})`);
  }
}

const sortedFamilies = [...families.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const missingFamilies = sortedFamilies.filter((family) => familyNames.get(family) === family).length;
const out = [];
out.push("# Glossário PT-BR de nomes de aberturas — revisão (SIG-1441)");
out.push("");
out.push("Gerado por `scripts/openings/pt-br-glossary-report.mjs` a partir de `src/data/openings-catalog.json`.");
out.push("**Não editar à mão** — regenere com `node scripts/openings/pt-br-glossary-report.mjs`.");
out.push("");
out.push(`- Famílias: ${familyNames.size} (ausentes no glossário: ${missingFamilies})`);
out.push(`- Partes de variação únicas: ${partRows.size} (com genérico em inglês: ${flaggedParts}; com nomes próprios mantidos: ${keptParts})`);
out.push("");
out.push("## Problemas (bloqueiam o script)");
out.push("");
if (problems.length === 0) {
  out.push("Nenhum — todas as famílias estão no glossário e nenhum genérico em inglês sobreviveu.");
} else {
  for (const problem of problems) {
    out.push(`- ${problem}`);
  }
}
out.push("");

for (const family of sortedFamilies) {
  out.push(`### ${family} → ${familyNames.get(family)}`);
  out.push("");
  const parts = [...families.get(family)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (parts.length === 0) {
    out.push("_(sem partes de variação)_");
    out.push("");
    continue;
  }
  out.push("| Inglês | PT-BR | Observações |");
  out.push("| --- | --- | --- |");
  for (const part of parts) {
    const row = partRows.get(part);
    const notes = [];
    if (row.overridden) notes.push("override");
    if (row.survivors.length > 0) notes.push(`GENÉRICO: ${row.survivors.join(", ")}`);
    if (row.kept.length > 0) notes.push(`nomes mantidos: ${row.kept.join(", ")}`);
    out.push(`| ${part} | ${row.translated} | ${notes.join("; ") || "—"} |`);
  }
  out.push("");
}

mkdirSync(new URL("../../docs/", import.meta.url), { recursive: true });
writeFileSync(reportPath, `${out.join("\n").replace(/\n*$/, "\n")}`);
console.log(
  `families=${familyNames.size} (missing=${missingFamilies}) parts=${partRows.size} (generic-flagged=${flaggedParts}, kept-names=${keptParts})`,
);
if (problems.length > 0) {
  console.error(`${problems.length} problem(s) — see docs/opening-names-pt-br-review.md`);
  process.exit(1);
}
