import assert from "node:assert/strict";
import { test } from "node:test";
import { bookRow, creditRows, resolveBookCredit, type CreditSegment } from "./credits.ts";

const text = (segments: CreditSegment[]): string => segments.map((s) => (typeof s === "string" ? s : s.text)).join("");
const links = (segments: CreditSegment[]): Record<string, string> =>
  Object.fromEntries(segments.flatMap((s) => (typeof s === "string" ? [] : [[s.text, s.href]])));

const V2 = { file: "opening-book-v2.bin.gz" };
const V3 = {
  file: "opening-book-v3.bin.gz",
  licenses: ["Chess-Results export; AJ-OTB (public domain, games only); Lumbra Lichess Broadcast (CC BY-SA 4.0)"],
  sources: [
    { profile: "lichess", months: ["2026-05"], files: [] },
    {
      profile: "masters",
      files: ["chess-results.pgn", "AJ-OTB.pgn", "LumbraLichessBroadcast.pgn"],
      license: "Chess-Results export; AJ-OTB (public domain, games only); Lumbra Lichess Broadcast (CC BY-SA 4.0)",
      attribution: "Includes games from Lumbra's GigaBase, Lichess Broadcast subset (lumbrasgigabase.com), CC BY-SA 4.0",
    },
    { profile: "correspondence", files: ["AJ-CORR.pgn"] },
  ],
};

test("v2 manifest (no sources) credits only Lichess, CC0, no CC BY-SA claim", () => {
  const credit = resolveBookCredit(V2);
  assert.deepEqual(credit.sources.map((s) => s.id), ["lichess-db"]);
  assert.equal(credit.shareAlike, false);
  for (const locale of ["en", "pt-br"] as const) {
    const row = bookRow(locale, V2);
    const t = text(row.segments);
    assert.match(t, /Lichess open database \(CC0\)/);
    assert.doesNotMatch(t, /Lumbra|Ajedrez|BY-SA/);
    assert.equal(links(row.segments).CC0, "https://creativecommons.org/publicdomain/zero/1.0/");
    assert.equal(links(row.segments)["Lichess open database"], "https://database.lichess.org");
  }
});

test("the deployed manifest renders", () => {
  const rows = creditRows("en");
  assert.deepEqual(rows.map((r) => r.id), ["engine", "explorer", "book", "puzzles"]);
});

test("v3-shaped manifest lists all sources and the CC BY-SA statement", () => {
  const credit = resolveBookCredit(V3);
  assert.deepEqual(credit.sources.map((s) => s.id), ["lichess-db", "lumbra-broadcast", "ajedrez-data", "chess-results"]);
  assert.equal(credit.shareAlike, true);
  const en = bookRow("en", V3);
  assert.match(text(en.segments), /modified/);
  assert.match(text(en.segments), /offered under CC BY-SA 4\.0: \/book\/opening-book-v3\.bin\.gz/);
  const l = links(en.segments);
  assert.equal(l["CC BY-SA 4.0"], "https://creativecommons.org/licenses/by-sa/4.0/");
  assert.equal(l["Lumbra's GigaBase – Lichess Broadcast"], "https://lumbrasgigabase.com");
  assert.equal(l["Ajedrez Data"], "https://ajedrezdata.com");
  assert.equal(l["/book/opening-book-v3.bin.gz"], "/book/opening-book-v3.bin.gz");
  const pt = text(bookRow("pt-br", V3).segments);
  assert.match(pt, /Construído pelo Xadrez Digital/);
  assert.match(pt, /modificado/);
  assert.match(pt, /domínio público/);
});

test("an unknown source shows its raw name without a link; explicit BY-SA license still triggers share-alike", () => {
  const row = bookRow("en", { file: "x.bin.gz", sources: [{ profile: "masters", files: ["mystery.pgn"], license: "Mystery (CC BY-SA 4.0)" }] });
  const t = text(row.segments);
  assert.match(t, /mystery\.pgn \(Mystery \(CC BY-SA 4\.0\)\)/);
  assert.equal(links(row.segments)["mystery.pgn"], undefined);
  assert.match(t, /offered under CC BY-SA 4\.0/);
});

test("engine row links the GPLv3 text and both source repositories", () => {
  const engine = creditRows("pt-br").find((r) => r.id === "engine")!;
  const l = links(engine.segments);
  assert.equal(l.GPLv3, "/engine/Copying.txt");
  assert.equal(l["stockfish.js"], "https://github.com/nmrugg/stockfish.js");
  assert.equal(l.Stockfish, "https://github.com/official-stockfish/Stockfish");
  assert.match(text(engine.segments), /executado localmente/);
});

test("puzzles and explorer rows", () => {
  const rows = creditRows("en");
  assert.equal(text(rows[1].segments), "Public Lichess explorer (masters and online database).");
  assert.equal(text(rows[3].segments), "Lichess puzzle database (CC0).");
});

// SIG-1249: book v4 replaces the Broadcast subset with Lumbra's complete release (CC BY-NC 4.0).
const V4 = {
  file: "opening-book-v4.bin.gz",
  licenses: ["Lichess open database (CC0 1.0)", "Lumbra's GigaBase (CC BY-NC 4.0)", "Ajedrez Data AJ-CORR (games stated as public domain, no annotations)"],
  sources: [
    { profile: "lichess", files: ["stdin"], license: "Lichess open database (CC0 1.0)" },
    {
      profile: "masters",
      files: ["LumbrasGigabase_OTB_Complete.pgn"],
      license: "Lumbra's GigaBase (CC BY-NC 4.0)",
      attribution: "Includes games from Lumbra's GigaBase (lumbrasgigabase.com), CC BY-NC 4.0",
    },
    { profile: "correspondence", files: ["AJ-CORR-PGN-000.pgn"], license: "Ajedrez Data AJ-CORR (games stated as public domain, no annotations)" },
  ],
};

test("v4 manifest credits Lumbra's complete GigaBase under CC BY-NC 4.0, with no CC BY-SA claim", () => {
  const credit = resolveBookCredit(V4);
  assert.deepEqual(credit.sources.map((s) => s.id), ["lichess-db", "lumbra-gigabase", "ajedrez-data"]);
  assert.equal(credit.shareAlike, false);
  for (const locale of ["en", "pt-br"] as const) {
    const segments = bookRow(locale, V4).segments;
    const t = text(segments);
    assert.match(t, /Lumbra's GigaBase \(CC BY-NC 4\.0\)/);
    assert.doesNotMatch(t, /BY-SA|Broadcast/);
    const l = links(segments);
    assert.equal(l["Lumbra's GigaBase"], "https://lumbrasgigabase.com");
    assert.equal(l["CC BY-NC 4.0"], "https://creativecommons.org/licenses/by-nc/4.0/");
  }
});
