// SIG-1347: the Opponent prep tree tests were retired with the panel; only
// the line-to-board mapping remains, used by the Library player dossier.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importSans } from "@/src/chess/pgn.ts";
import { preparationLineTitle, prepareAgainstLine } from "./prep-rows.ts";

describe("prepareAgainstLine", () => {
  it("orients to the user's side (opposite of the tree color)", () => {
    const againstWhite = prepareAgainstLine(["e4", "e5"], "white");
    assert.equal(againstWhite.orientation, "black");
    assert.equal(againstWhite.game.moves, "e4 e5");
    assert.equal(againstWhite.game.color, "black");
    const againstBlack = prepareAgainstLine(["e4", "c5"], "black");
    assert.equal(againstBlack.orientation, "white");
    assert.equal(againstBlack.game.moves, "e4 c5");
    assert.equal(againstBlack.game.color, "white");
  });

  it("carries a SAN path the board import accepts", () => {
    const { game: line } = prepareAgainstLine(["e4", "e5", "Nf3"], "white");
    const imported = importSans(line.moves?.split(" ") ?? []);
    assert.equal(imported.warnings.length, 0);
    let cursor = imported.tree.children;
    let count = 0;
    while (cursor.length > 0) {
      cursor = cursor[0]?.children ?? [];
      count += 1;
    }
    assert.equal(count, 3);
  });

  it("uses placeholder players and names the line instead", () => {
    const { game } = prepareAgainstLine(["e4", "e5"], "white", "Preparation line · 1. e4 e5");
    assert.equal(game.whiteName, "?");
    assert.equal(game.blackName, "?");
    assert.equal(game.opening, "Preparation line · 1. e4 e5");
  });
});

describe("preparationLineTitle", () => {
  it("numbers the moves and localizes the label", () => {
    assert.equal(preparationLineTitle("en", ["e4", "e5"]), "Preparation line · 1. e4 e5");
    assert.equal(preparationLineTitle("pt-br", ["e4", "e5"]), "Linha de preparação · 1. e4 e5");
  });

  it("uses only the label for the start position", () => {
    assert.equal(preparationLineTitle("en", []), "Preparation line");
  });
});
