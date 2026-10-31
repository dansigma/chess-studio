import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { STUDIO_PANEL_STRING_KEYS, TABLES, tPanels } from "./studio-panel-strings.ts";

test("studio panel string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every studio panel string key renders non-empty in both locales", () => {
  const keys = new Set<string>(STUDIO_PANEL_STRING_KEYS);
  assert.equal(keys.size, STUDIO_PANEL_STRING_KEYS.length, "studio panel string keys must be unique");
  for (const key of STUDIO_PANEL_STRING_KEYS) {
    assert.ok(tPanels("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tPanels("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("studio panel interpolated strings render whole sentences with vars", () => {
  assert.equal(tPanels("en", "explorer.count.other", { count: 3 }), "3 games");
  assert.equal(tPanels("pt-br", "explorer.count.other", { count: 3 }), "3 partidas");
  assert.equal(tPanels("en", "explorer.count.one", { count: 1 }), "1 game");
  assert.equal(tPanels("pt-br", "explorer.count.one", { count: 1 }), "1 partida");
  assert.equal(tPanels("en", "engine.status.analyzing", { nps: "12 kN/s" }), "Analyzing · 12 kN/s");
  assert.equal(tPanels("pt-br", "engine.status.analyzing", { nps: "12 kN/s" }), "Analisando · 12 kN/s");
  assert.equal(tPanels("en", "engine.cores.title.other", { count: 8 }), "8 CPU cores");
  assert.equal(tPanels("pt-br", "engine.cores.title.one", { count: 1 }), "1 núcleo de CPU");
  assert.equal(tPanels("en", "explorer.error"), "Couldn't load the explorer. Try again.");
  assert.equal(
    tPanels("pt-br", "explorer.error"),
    "Não foi possível carregar o explorador. Tente de novo.",
  );
  assert.equal(tPanels("en", "games.title", { name: "Games" }), "Games · Games");
  assert.equal(tPanels("pt-br", "games.title", { name: "Partidas" }), "Partidas · Partidas");
  assert.equal(tPanels("en", "games.source.curated"), "Curated");
  assert.equal(tPanels("pt-br", "games.source.curated"), "Selecionados");
  assert.equal(tPanels("en", "panels.playerGames", { title: "Magnus" }), "Magnus — games");
  assert.equal(tPanels("pt-br", "panels.playerGames", { title: "Magnus" }), "Magnus — partidas");
  assert.equal(tPanels("en", "panels.playerExplorer", { title: "Magnus" }), "Magnus");
  assert.equal(tPanels("pt-br", "notation.toolbar.skipForward"), "Avançar vários lances");
});
