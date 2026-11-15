import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linePgnCheck, linePgnWarningText, linePgnWarnings } from "./line-check.ts";

describe("linePgnCheck", () => {
  it("counts the main-line moves of a clean PGN", () => {
    const check = linePgnCheck("1. e4 e5 2. Nf3 Nc6");
    assert.equal(check.moves, 4);
    assert.deepEqual(check.warnings, []);
  });

  it("returns zero moves for an empty line", () => {
    assert.deepEqual(linePgnCheck(""), { moves: 0, warnings: [] });
  });

  it("reports the first illegal move and keeps the played prefix", () => {
    const check = linePgnCheck('[Event "A"]\n\n1. e4 e5 2. e5 *\n');
    assert.equal(check.moves, 2);
    assert.equal(check.warnings.length, 1);
    assert.deepEqual(check.warnings[0], { kind: "illegalMove", move: "e5" });
  });

  it("reports an unplayable first move as a skipped move", () => {
    const check = linePgnCheck('[Event "F"]\n\n1... e5 *\n');
    assert.equal(check.moves, 0);
    assert.deepEqual(check.warnings[0], { kind: "illegalMove", move: "e5" });
  });
});

describe("linePgnWarnings", () => {
  it("maps a skipped null move and leaves unknown messages to the generic text", () => {
    assert.deepEqual(linePgnWarnings(['Skipped null move "--": could not load resulting position']), [
      { kind: "skippedMove", move: "--" },
    ]);
    assert.deepEqual(linePgnWarnings(["Some future problem"]), [
      { kind: "other", message: "Some future problem" },
    ]);
  });
});

describe("linePgnWarningText", () => {
  const warning = { kind: "illegalMove" as const, move: "Qh5" };

  it("renders the first problem in both locales", () => {
    assert.equal(
      linePgnWarningText("en", warning),
      "Illegal move “Qh5” skipped; the rest of the line was not imported.",
    );
    assert.equal(
      linePgnWarningText("pt-br", warning),
      "Lance ilegal “Qh5” ignorado; o resto da linha não foi importado.",
    );
  });

  it("never shows an internal message for an unknown problem", () => {
    const text = linePgnWarningText("en", { kind: "other", message: "Skipped something internal" });
    assert.equal(text, "Some moves in this line were skipped during import.");
    assert.doesNotMatch(text, /internal/);
  });
});
