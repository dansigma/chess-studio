import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHeaderDate, formatTimeControl, gameHeaderInfo, safeGameUrl } from "./game-header-info.ts";

const CHESSCOM = {
  Event: "Live Chess",
  Site: "Chess.com",
  Date: "2026.11.03",
  Round: "-",
  White: "winner123412341234",
  Black: "Skillfulness",
  Result: "0-1",
  ECO: "A40",
  ECOUrl: "https://www.chess.com/openings/Queens-Pawn-Opening-1...c6",
  UTCDate: "2026.11.03",
  WhiteElo: "2057",
  BlackElo: "2082",
  TimeControl: "60",
  Termination: "Skillfulness won by checkmate",
  Link: "https://www.chess.com/game/live/186438253074",
};

test("Chess.com headers", () => {
  const info = gameHeaderInfo(CHESSCOM, "en");
  assert.deepEqual(info.source, { kind: "chesscom", label: "Chess.com", url: "https://www.chess.com/game/live/186438253074" });
  assert.equal(info.event, null);
  assert.equal(info.round, null);
  assert.equal(info.site, null);
  assert.equal(info.date?.text, "Nov 3, 2026");
  assert.equal(info.eco, "A40");
  assert.equal(info.openingName, "Queen's Pawn Opening");
  assert.equal(info.timeControl?.text, "1+0 Bullet");
  assert.equal(info.result, "0-1");
  assert.equal(gameHeaderInfo(CHESSCOM, "pt-br").date?.text, "3 nov 2026");
});

test("Lichess headers", () => {
  const info = gameHeaderInfo(
    { Event: "Rated Blitz game", Site: "https://lichess.org/AbCd1234", Date: "2024.05.06", TimeControl: "180+2", ECO: "B12", Opening: "Caro-Kann Defense", Result: "1-0" },
    "en",
  );
  assert.deepEqual(info.source, { kind: "lichess", label: "Lichess", url: "https://lichess.org/AbCd1234" });
  assert.equal(info.event, null);
  assert.equal(info.site, null);
  assert.equal(info.timeControl?.text, "3+2 Blitz");
  assert.equal(info.eco, "B12");
  assert.equal(info.openingName, "Caro-Kann Defense");
  assert.equal(gameHeaderInfo({ Opening: "Caro-Kann Defense", ECO: "B12" }, "pt-br").openingName, "Defesa Caro-Kann");
});

test("over the board headers", () => {
  const info = gameHeaderInfo(
    { Event: "Biel GM", Site: "Biel SUI", Date: "2005.07.17", Round: "5", ECO: "C91", WhiteElo: "2660", BlackElo: "2528", Result: "1/2-1/2", TimeControl: "5400+30" },
    "en",
  );
  assert.deepEqual(info.source, { kind: "otb", label: "Over the board" });
  assert.equal(info.event, "Biel GM");
  assert.equal(info.round, "R5");
  assert.equal(info.site, null, "the event already names the city");
  assert.equal(info.date?.text, "Jul 17, 2005");
  assert.equal(info.eco, "C91");
  assert.equal(info.timeControl, null);
  assert.equal(info.result, "½-½");
  const pt = gameHeaderInfo({ Event: "Biel GM", Date: "2005.07.17" }, "pt-br");
  assert.equal(pt.source?.label, "Presencial");
  assert.equal(pt.date?.text, "17 jul 2005");
  // Site equal to Event is not repeated.
  assert.equal(gameHeaderInfo({ Event: "Biel", Site: "Biel" }).site, null);
});

test("a bare PGN with only unknown values is empty", () => {
  const info = gameHeaderInfo({ Event: "?", Site: "?", Date: "????.??.??", Round: "?", White: "?", Black: "?", Result: "*", ECO: "?", Opening: "?" }, "en");
  assert.deepEqual(info, {
    source: null, event: null, round: null, site: null, date: null, eco: null, openingName: null,
    timeControl: null, result: null, whiteTitle: null, blackTitle: null,
  });
});

test("date partials", () => {
  assert.equal(formatHeaderDate("2005.07.17", "en"), "Jul 17, 2005");
  assert.equal(formatHeaderDate("2005.07.17", "pt-br"), "17 jul 2005");
  assert.equal(formatHeaderDate("2005.07.??", "pt-br"), "jul 2005");
  assert.equal(formatHeaderDate("2005.07.??", "en"), "Jul 2005");
  assert.equal(formatHeaderDate("2005.??.??", "en"), "2005");
  assert.equal(formatHeaderDate("????.??.??", "en"), null);
  assert.equal(formatHeaderDate("?", "en"), null);
  // UTC: the first of the month never shifts to the previous day/month.
  assert.equal(formatHeaderDate("2024.01.01", "en"), "Jan 1, 2024");
  assert.equal(gameHeaderInfo({ UTCDate: "2024.03.02" }).date?.text, "Mar 2, 2024");
});

test("link allow-list", () => {
  assert.ok(safeGameUrl("https://www.chess.com/game/live/1"));
  assert.ok(safeGameUrl("https://lichess.org/AbCd1234"));
  assert.equal(safeGameUrl("http://lichess.org/AbCd1234"), null);
  assert.equal(safeGameUrl("https://evil.example/chess.com"), null);
  assert.equal(safeGameUrl("https://chess.com.evil.example/x"), null);
  assert.equal(safeGameUrl("javascript:alert(1)"), null);
  assert.equal(safeGameUrl("https://user:pw@lichess.org/x"), null);
  const bad = gameHeaderInfo({ Site: "Chess.com", Link: "https://evil.example/x" });
  assert.deepEqual(bad.source, { kind: "chesscom", label: "Chess.com" });
});

test("time control and titles", () => {
  assert.equal(formatTimeControl("600", "en")?.text, "10+0 Rapid");
  assert.equal(formatTimeControl("600", "pt-br")?.text, "10+0 Rápida");
  assert.equal(formatTimeControl("1/259200", "en")?.text, "Daily");
  assert.equal(formatTimeControl("-", "en"), null);
  assert.equal(formatTimeControl("5400+30", "en")?.text, "90+30 Classical");
  assert.equal(gameHeaderInfo({ WhiteTitle: "GM", BlackTitle: "BOT" }).whiteTitle, "GM");
  assert.equal(gameHeaderInfo({ WhiteTitle: "GM", BlackTitle: "BOT" }).blackTitle, null);
});

test("site drops the country code and stays when the event does not name the city", () => {
  const info = gameHeaderInfo({ Event: "Tata Steel Masters", Site: "Wijk aan Zee NED", Date: "2024.01.20" });
  assert.equal(info.site, "Wijk aan Zee");
});
