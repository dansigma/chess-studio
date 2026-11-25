import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
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

test("public flags contain one small WebP for each mapped region and the upstream license", () => {
  const directory = new URL("../../../public/flags/", import.meta.url);
  const expectedFlags = [...new Set(Object.values(FIDE_TO_ISO))].map((code) => `${code}.webp`);
  assert.deepEqual(readdirSync(directory).sort(), ["LICENSE", ...expectedFlags].sort());
  for (const file of expectedFlags) {
    assert.ok(statSync(new URL(file, directory)).size < 10_000, `${file} must be under 10 KB`);
  }
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
