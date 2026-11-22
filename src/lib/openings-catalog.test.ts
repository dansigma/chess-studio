import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogTree, loadCatalog, searchCatalog } from "./openings-catalog.ts";

test("loadCatalog shares its promise and exposes the end position of each line", async () => {
  const pending = loadCatalog();
  assert.strictEqual(loadCatalog(), pending);
  const entries = await pending;
  assert.strictEqual(await loadCatalog(), entries);
  assert.ok(entries.length >= 3500);
  const sicilian = entries.find(({ name }) => name === "Sicilian Defense");
  assert.ok(sicilian);
  assert.deepEqual(sicilian.uci, ["e2e4", "c7c5"]);
  assert.equal(sicilian.fen, "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
  assert.equal(sicilian.side, "w");
});

test("catalogTree groups and localizes each level while retaining alternate lines and suffixes", async () => {
  const entries = await loadCatalog();
  const tree = catalogTree(entries, "pt-br");
  const sicilian = tree.find(({ name }) => name === "Defesa Siciliana");
  assert.ok(sicilian);
  const najdorf = sicilian.children.find(({ name }) => name === "Variante Najdorf");
  assert.ok(najdorf);
  assert.equal(najdorf.line.eco, "B90");
  const englishAttack = najdorf.children.find(({ name }) => name === "Ataque Inglês");
  assert.ok(englishAttack);
  assert.ok(englishAttack.entries.length > 1);
  assert.equal(englishAttack.uci.at(-1), "c1e3");
  assert.equal(englishAttack.fen, englishAttack.line.fen);
  assert.equal(englishAttack.side, "b");
  assert.ok(najdorf.children.some(({ name }) => name === "Ataque Inglês, Anti-Inglês"));

  const onlySubvariation = catalogTree([englishAttack.line]);
  assert.deepEqual(onlySubvariation[0].entries, []);
  assert.strictEqual(onlySubvariation[0].line, englishAttack.line);
});

test("searchCatalog matches ECO and English or Portuguese words, ignoring accents", async () => {
  const entries = await loadCatalog();
  for (const query of ["najdorf", "siciliana najdorf", "Sicilian Defense: Najdorf", "B90"]) {
    const results = searchCatalog(entries, query, "pt-br");
    assert.equal(results[0]?.name, "Sicilian Defense: Najdorf Variation", query);
  }
  assert.ok(searchCatalog(entries, "defesa nimzoindia", "en").length > 0);
  assert.ok(searchCatalog(entries, "  DEFÉSA NIMZOÍNDIA  ", "pt-br").length > 0);
  assert.deepEqual(searchCatalog(entries, "  ", "en"), []);
});

test("searchCatalog ranks a name prefix ahead of a word match", async () => {
  const entries = await loadCatalog();
  const results = searchCatalog(entries, "Italian", "en");
  assert.equal(results[0]?.name, "Italian Game");
  assert.ok(results.some(({ name }) => !name.startsWith("Italian")));
});

test("searchCatalog finds the same Moscow lines in English and Portuguese", async () => {
  const entries = await loadCatalog();
  const expected = entries.filter(({ name }) => name.includes("Moscow"))
    .sort((a, b) => a.uci.length - b.uci.length);
  for (const locale of ["en", "pt-br"] as const) {
    assert.deepEqual(searchCatalog(entries, "Moscou", locale), expected);
    assert.deepEqual(searchCatalog(entries, "Moscow", locale), expected);
  }
});

test("searchCatalog ignores generic words in both languages without changing the ranking", async () => {
  const entries = await loadCatalog();
  for (const locale of ["en", "pt-br"] as const) {
    const reti = searchCatalog(entries, "reti", locale);
    assert.ok(reti.length > 0);
    assert.deepEqual(searchCatalog(entries, "abertura reti", locale), reti);
    assert.deepEqual(searchCatalog(entries, "reti opening", locale), reti);

    const moscow = searchCatalog(entries, "moscow", locale);
    assert.deepEqual(searchCatalog(entries, "defence gambito ataque variante de moscow linha", locale), moscow);
    assert.deepEqual(searchCatalog(entries, "moscow defense gambit attack variation game system line", locale), moscow);
  }
});

test("searchCatalog matches the original names for a query of only generic words", async () => {
  const entries = await loadCatalog();
  const results = searchCatalog(entries, "defesa", "pt-br");
  assert.ok(results.some(({ name }) => name === "Sicilian Defense"));
  assert.ok(results.some(({ name }) => name === "Semi-Slav Defense: Moscow Variation"));
  assert.ok(!results.some(({ name }) => name === "Reti Opening"));
});
