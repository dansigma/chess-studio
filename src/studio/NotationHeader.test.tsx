// SIG-1212: the notation header shows result, title, source, event, date and opening.
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";
import { NotationHeader } from "./NotationHeader";

before(() => setupDom());
afterEach(() => cleanup());
after(() => teardownDom());

const OTB = { White: "Nakamura,Hikaru", Black: "Carlsen,Magnus", WhiteElo: "2660", BlackElo: "2528", WhiteTitle: "GM", Result: "1/2-1/2", Event: "Biel GM", Site: "Biel SUI", Round: "5", Date: "2005.07.17", ECO: "C91", Opening: "Ruy Lopez" };

test("over-the-board game renders both lines", () => {
  render(<NotationHeader headers={OTB} onEdit={() => {}} />);
  assert.ok(screen.getByText("½-½"));
  assert.ok(screen.getByText("GM"));
  assert.ok(screen.getByText("C91"));
  const info = screen.getByTestId("notation-header-info");
  assert.equal(info.getAttribute("title"), "Over the board · Biel GM · R5 · Jul 17, 2005 · C91 Ruy Lopez");
  assert.equal(info.querySelector("a"), null);
});

test("unfinished game shows vs, locale pt-br", () => {
  render(<NotationHeader headers={{ ...OTB, Result: "*" }} locale="pt-br" onEdit={() => {}} />);
  assert.ok(screen.getByText("contra"));
  assert.match(screen.getByTestId("notation-header-info").getAttribute("title") ?? "", /^Presencial · Biel GM · R5/);
});

test("Chess.com game links to the original game safely", () => {
  render(
    <NotationHeader
      headers={{ White: "a", Black: "b", Site: "Chess.com", Link: "https://www.chess.com/game/live/1", TimeControl: "180+2", Date: "2026.11.03" }}
      onEdit={() => {}}
    />,
  );
  const link = screen.getByRole("link", { name: /Open original game/ });
  assert.equal(link.getAttribute("href"), "https://www.chess.com/game/live/1");
  assert.equal(link.getAttribute("target"), "_blank");
  assert.equal(link.getAttribute("rel"), "noopener noreferrer");
});

test("inline mode keeps one line with the ECO badge and no caption row", () => {
  render(<NotationHeader inline headers={OTB} onEdit={() => {}} />);
  assert.ok(screen.getByText("C91"));
  assert.ok(screen.getByText("½-½"));
  assert.equal(screen.queryByTestId("notation-header-info"), null);
});

test("two placeholder players keep the opening as the title", () => {
  render(<NotationHeader headers={{ White: "?", Black: "?", Opening: "Italian Game", ECO: "C50" }} onEdit={() => {}} />);
  assert.ok(screen.getByText("Italian Game"));
  assert.equal(screen.queryByTestId("notation-header-players"), null);
});
