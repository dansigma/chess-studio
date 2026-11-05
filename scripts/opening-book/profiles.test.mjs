// scripts/opening-book/profiles.test.mjs
// SIG-1229: player names, profile filters, time controls and the de-duplication set.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HashSet64, hash64 } from "./hashset.mjs";
import { normalizePlayer, playerHash } from "./players.mjs";
import { EXCLUDED_SOURCES, MIN_DISTINCT_PLAYERS, ONLINE_PATTERN, profileRejection, timeControlSeconds } from "./profiles.mjs";

describe("normalizePlayer", () => {
  it("makes surname + first initial the identity, whatever the format", () => {
    for (const name of ["Carlsen, Magnus", "Carlsen, M", "Carlsen,M.", "Carlsen, M.", "Magnus Carlsen", "CARLSEN, MAGNUS", "Carlsén, Magnus", "  Carlsen ,  Magnus  ", "GM Magnus Carlsen (NOR)", "Carlsen, Magnus [NOR]"]) {
      assert.equal(normalizePlayer(name), "carlsen, m", name);
    }
  });
  it("strips accents and folds special letters", () => {
    assert.equal(normalizePlayer("Müller, Jörg"), "muller, j");
    assert.equal(normalizePlayer("Øyen, Henrik"), "oyen, h");
    assert.equal(normalizePlayer("Žižić, Petar"), "zizic, p");
    assert.equal(normalizePlayer("Łukasz, Piotr"), "lukasz, p");
    assert.equal(normalizePlayer("Anish   Giri"), "giri, a");
    assert.equal(normalizePlayer("Vachier-Lagrave, Maxime"), "vachier-lagrave, m");
  });
  it("without a comma the last token is the surname", () => {
    assert.equal(normalizePlayer("Fabiano Caruana"), "caruana, f");
    assert.equal(normalizePlayer("Carlsen"), "carlsen");
    // Documented limit: a compound surname without a comma cannot be told from given names.
    assert.equal(normalizePlayer("Loek van Wely"), "wely, l");
    assert.equal(normalizePlayer("van Wely, Loek"), "van wely, l");
  });
  it("unknown names are one empty identity", () => {
    for (const name of ["", "?", "??", "-", "Unknown", "unknown", "N.N.", "?, ?", "Anonymous", undefined, null]) {
      assert.equal(normalizePlayer(name), "", String(name));
    }
  });
  it("playerHash is stable, 32-bit, never 0 for a real player, and 0 for unknown", () => {
    assert.equal(playerHash(""), 0);
    assert.equal(playerHash("carlsen, m"), playerHash(normalizePlayer("Magnus Carlsen")));
    assert.notEqual(playerHash("carlsen, m"), playerHash("caruana, f"));
    for (const name of ["a", "b", "carlsen, m", "x, y"]) {
      const hash = playerHash(name);
      assert.ok(hash > 0 && hash <= 0xffffffff);
    }
  });
});

describe("timeControlSeconds", () => {
  it("reads increments, per-period and plain seconds", () => {
    assert.equal(timeControlSeconds("180+2"), 260);
    assert.equal(timeControlSeconds("1/86400"), 86400);
    assert.equal(timeControlSeconds("10/259200"), 259200);
    assert.equal(timeControlSeconds("40/7200:3600"), 7200);
    assert.equal(timeControlSeconds("86400"), 86400);
    for (const none of ["-", "?", "", undefined]) {
      assert.equal(timeControlSeconds(none), null);
    }
  });
});

const MASTER = { Event: "Open", Site: "Reykjavik ISL", Result: "1/2-1/2", WhiteElo: "2100", BlackElo: "2650" };

describe("masters profile", () => {
  it("passes OTB games with both Elos at the bar, no TimeControl needed", () => {
    assert.equal(profileRejection("masters", MASTER, {}), null);
    assert.equal(profileRejection("masters", { ...MASTER, TimeControl: "60+0" }, {}), null, "no speed filter");
  });
  it("Elo: both must be present and >= 2100; missing means skip", () => {
    assert.equal(profileRejection("masters", { ...MASTER, WhiteElo: "2099" }, {}), "elo");
    assert.equal(profileRejection("masters", { ...MASTER, BlackElo: "1900" }, {}), "elo");
    for (const missing of [undefined, "", "?", "0", "-"]) {
      assert.equal(profileRejection("masters", { ...MASTER, BlackElo: missing }, {}), "noElo", String(missing));
      assert.equal(profileRejection("masters", { ...MASTER, WhiteElo: missing }, {}), "noElo", String(missing));
    }
    assert.equal(profileRejection("masters", { ...MASTER, WhiteElo: "2250" }, { minElo: 2300 }), "elo", "--min-elo overrides");
  });
  it("skips unfinished games and non-standard starts", () => {
    assert.equal(profileRejection("masters", { ...MASTER, Result: "*" }, {}), "result");
    assert.equal(profileRejection("masters", { ...MASTER, Result: undefined }, {}), "result");
    assert.equal(profileRejection("masters", { ...MASTER, FEN: "8/8/8/8/8/8/8/K6k w - - 0 1", SetUp: "1" }, {}), "variant");
    assert.equal(profileRejection("masters", { ...MASTER, Variant: "Chess960" }, {}), "variant");
  });
  it("skips online games by Site or Event", () => {
    for (const place of [
      { Site: "https://lichess.org/abcd1234" },
      { Site: "Chess.com" },
      { Site: "chess.com INT" },
      { Site: "Internet Chess Club" },
      { Site: "ICC" },
      { Site: "FICS" },
      { Site: "freechess.org" },
      { Site: "Playchess.com" },
      { Site: "chess24.com" },
      { Event: "Titled Tuesday Online" },
      { Event: "Online Blitz Championship" },
    ]) {
      assert.equal(profileRejection("masters", { ...MASTER, ...place }, {}), "online", JSON.stringify(place));
    }
    for (const fine of ["Wijk aan Zee NED", "Moscow RUS", "Hastings ENG", "Tbilisi GEO"]) {
      assert.equal(profileRejection("masters", { ...MASTER, Site: fine }, {}), null, fine);
    }
    assert.ok(ONLINE_PATTERN.test("lichess.org"));
  });
});

describe("masters: Lumbra's GigaBase Source tag", () => {
  it("drops LichessEliteDatabase (online Lichess play), whatever the Site", () => {
    assert.equal(profileRejection("masters", { ...MASTER, Source: "LichessEliteDatabase" }, {}), "online");
    assert.equal(profileRejection("masters", { ...MASTER, Source: "LichessEliteDatabase", Site: "https://lichess.org/AbCdEfGh" }, {}), "online");
    assert.ok(EXCLUDED_SOURCES.has("LichessEliteDatabase"));
  });
  it("keeps the other sources", () => {
    for (const Source of ["Britbase", "ChessNostalgia", "ChessOK", "Chessopolis", "Convekta", "LumbrasGigaBase", "PGNMentor", "TWIC", "LichessBroadcast"]) {
      assert.equal(profileRejection("masters", { ...MASTER, Source }, {}), null, Source);
    }
  });
  it("keeps LichessBroadcast games although Site or Event contain lichess.org", () => {
    assert.equal(profileRejection("masters", { ...MASTER, Source: "LichessBroadcast", Site: "https://lichess.org/broadcast/tata-steel-masters-2024/round-5/AbCdEfGh" }, {}), null);
    assert.equal(profileRejection("masters", { ...MASTER, Source: "LichessBroadcast", Site: "lichess.org", Event: "Lichess Broadcast: Candidates" }, {}), null);
  });
  it("keeps a lichess.org/broadcast URL in Site or Event even without a Source tag, but not other lichess.org games", () => {
    assert.equal(profileRejection("masters", { ...MASTER, Site: "https://lichess.org/broadcast/candidates-2024/round-1/xyz" }, {}), null);
    assert.equal(profileRejection("masters", { ...MASTER, Site: "?", Event: "Round 3 https://lichess.org/broadcast/x/y/z" }, {}), null);
    assert.equal(profileRejection("masters", { ...MASTER, Site: "https://lichess.org/AbCdEfGh" }, {}), "online");
    assert.equal(profileRejection("masters", { ...MASTER, Site: "lichess.org", Source: "LumbrasGigaBase" }, {}), "online");
  });
  it("Elo and result rules still apply to broadcast games", () => {
    assert.equal(profileRejection("masters", { ...MASTER, Source: "LichessBroadcast", WhiteElo: "2000" }, {}), "elo");
    assert.equal(profileRejection("masters", { ...MASTER, Source: "LichessBroadcast", Result: "*" }, {}), "result");
  });
});

describe("correspondence profile", () => {
  const CORR = { Event: "ICCF World Championship Final", Site: "ICCF", Result: "1-0", WhiteElo: "2450", BlackElo: "2400" };
  it("keeps correspondence by TimeControl or by marker", () => {
    assert.equal(profileRejection("correspondence", CORR, {}), null);
    assert.equal(profileRejection("correspondence", { ...CORR, TimeControl: "10/259200" }, {}), null);
    assert.equal(profileRejection("correspondence", { Result: "1-0", WhiteElo: "2450", BlackElo: "2400", Event: "Open", Site: "somewhere", TimeControl: "1/86400" }, {}), null, "a day-long time control is evidence enough");
    for (const [Event, Site] of [["IECG Email Tournament", "?"], ["LSS Server Daily", "?"], ["Open", "ICCF Webserver"], ["Correspondence Olympiad", "?"]]) {
      assert.equal(profileRejection("correspondence", { ...CORR, Event, Site }, {}), null, `${Event} / ${Site}`);
    }
  });
  it("skips OTB and live online play", () => {
    assert.equal(profileRejection("correspondence", { ...CORR, Event: "Open 2019", Site: "Berlin GER" }, {}), "notCorrespondence", "no evidence it is correspondence");
    assert.equal(profileRejection("correspondence", { ...CORR, TimeControl: "180+0" }, {}), "notCorrespondence", "a clock under a day is live play");
    assert.equal(profileRejection("correspondence", { ...CORR, TimeControl: "60+0", Site: "lichess.org" }, {}), "notCorrespondence");
  });
  it("the online-server exclusion does not apply: daily games on a server are the point", () => {
    assert.equal(profileRejection("correspondence", { ...CORR, Site: "lichess.org", TimeControl: "1/86400" }, {}), null);
    assert.equal(profileRejection("correspondence", { ...CORR, Site: "https://www.chess.com/daily", Event: "Daily Chess", TimeControl: undefined }, {}), null);
  });
  it("--assume-correspondence trusts a collection known to be all correspondence", () => {
    const bare = { Result: "1-0", WhiteElo: "2450", BlackElo: "2400", Event: "?", Site: "?" };
    assert.equal(profileRejection("correspondence", bare, {}), "notCorrespondence");
    assert.equal(profileRejection("correspondence", bare, { assumeCorrespondence: true }), null);
    assert.equal(profileRejection("correspondence", { ...bare, TimeControl: "180+0" }, { assumeCorrespondence: true }), "notCorrespondence", "live clocks are still skipped");
  });
  it("uses its own Elo bar (ICCF / server scale), 2300 by default", () => {
    assert.equal(profileRejection("correspondence", { ...CORR, WhiteElo: "2299" }, {}), "elo");
    assert.equal(profileRejection("correspondence", { ...CORR, WhiteElo: "2299" }, { minElo: 2200 }), null);
    assert.equal(profileRejection("correspondence", { ...CORR, BlackElo: undefined }, {}), "noElo");
  });
});

describe("lichess profile is unchanged", () => {
  it("still filters by speed and Elo, and now skips FEN starts", () => {
    const ok = { WhiteElo: "2400", BlackElo: "2400", TimeControl: "300+0", Result: "1-0" };
    assert.equal(profileRejection("lichess", ok, {}), null);
    assert.equal(profileRejection("lichess", { ...ok, TimeControl: "60+0" }, {}), "speed");
    assert.equal(profileRejection("lichess", { ...ok, WhiteElo: "2299" }, {}), "elo");
    assert.equal(profileRejection("lichess", { ...ok, FEN: "8/8/8/8/8/8/8/K6k w - - 0 1" }, {}), "variant");
  });
  it("the distinct player constant is 5", () => {
    assert.equal(MIN_DISTINCT_PLAYERS, 5);
  });
});

describe("HashSet64", () => {
  it("reports duplicates and survives growth", () => {
    const set = new HashSet64(16);
    for (let i = 0; i < 50_000; i += 1) {
      const [hi, lo] = hash64(`game ${i}`);
      assert.equal(set.add(hi, lo), true);
    }
    assert.equal(set.size, 50_000);
    for (let i = 0; i < 50_000; i += 7) {
      const [hi, lo] = hash64(`game ${i}`);
      assert.equal(set.add(hi, lo), false);
    }
    assert.equal(set.size, 50_000);
    assert.equal(set.add(...hash64("a brand new game")), true);
  });
  it("hash64 differs for near-identical strings", () => {
    assert.notDeepEqual(hash64("abc"), hash64("abd"));
    assert.deepEqual(hash64("abc"), hash64("abc"));
  });
});
