import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { countryName, FIDE_TO_ISO, fideToIso } from "./federation.ts";

test("maps FIDE codes case-insensitively, including non-ISO codes and UK federations", () => {
  for (const [fed, iso] of Object.entries({
    GER: "de", ned: "nl", BRN: "bh", BRU: "bn", ENG: "gb-eng", SCO: "gb-sct", WLS: "gb-wls",
    KOS: "xk", CUR: "cw", AHO: "cw", FID: null, ZZZ: null,
  })) {
    assert.equal(fideToIso(fed), iso, fed);
  }
});

test("public flags contain one SVG for each mapped region", () => {
  const files = readdirSync(new URL("../../../public/flags/", import.meta.url));
  const expectedFlags = [...new Set(Object.values(FIDE_TO_ISO))].map((code) => `${code}.svg`);
  assert.deepEqual(files.filter((file) => file.endsWith(".svg")).sort(), expectedFlags.sort());
  assert.ok(files.includes("LICENSE"));
});

test("localizes country and federation names and preserves unknown codes", () => {
  for (const [fed, en, ptBr] of [
    ["ind", "India", "Índia"],
    ["UZB", "Uzbekistan", "Uzbequistão"],
    ["ENG", "England", "Inglaterra"],
    ["SCO", "Scotland", "Escócia"],
    ["WLS", "Wales", "País de Gales"],
    ["fid", "FIDE", "FIDE"],
    ["zzz", "zzz", "zzz"],
  ] as const) {
    assert.equal(countryName(fed, "en"), en, fed);
    assert.equal(countryName(fed, "pt-br"), ptBr, fed);
  }
});
