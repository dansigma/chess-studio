// SIG-1344: the dossier opening card's coverage status — one status per card,
// computed against the user's repertoire of the opposite colour.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { setupDom, teardownDom } from "../../../test-utils/dom.ts";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { DossierOpeningRow } from "@/src/lib/prep/dossier-openings";
import type { BoardSession } from "@/src/store/slices/types";

const { DossierOpeningStatus } = await import("./DossierOpeningStatus.tsx");
const { importSans } = await import("@/src/chess/pgn.ts");
const { emptyBoard } = await import("@/src/store/slices/board-helpers.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

function tree(line: string) {
  const imported = importSans(line ? line.split(" ") : []);
  assert.equal(imported.warnings.length, 0, `fixture failed to import: ${imported.warnings}`);
  return imported.tree;
}

/** One neutral board plus the requested repertoire trees. */
function seed(lines: { white?: string; black?: string }) {
  const boards: BoardSession[] = [emptyBoard("Board", "board-main")];
  for (const color of ["white", "black"] as const) {
    const line = lines[color];
    if (line === undefined) {
      continue;
    }
    const board = emptyBoard(`Repertoire ${color}`, `rep-${color}`);
    boards.push({ ...board, repertoireColor: color, tree: tree(line) });
  }
  useStudioStore.setState({ boards, activeBoardId: "board-main" });
}

function row(line: string): DossierOpeningRow {
  return {
    key: "italian game",
    eco: "C50",
    opening: "Italian Game",
    games: 3,
    sharePct: 100,
    wins: 2,
    draws: 0,
    losses: 1,
    scorePct: 67,
    lastYear: 2024,
    line: line.split(" "),
  };
}

function status() {
  return screen.getByTestId("dossier-opening-status");
}

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());
beforeEach(() => {
  useStudioStore.setState({
    workspaceView: "library",
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
  });
  seed({});
});

test("marks a covered line for a White player with the user's Black repertoire", () => {
  seed({ black: "e4 e5 Nf3 Nc6" });
  render(<DossierOpeningStatus row={row("e4 e5 Nf3 Nc6")} opponentColor="white" />);
  assert.equal(status().getAttribute("data-status"), "covered");
  assert.equal(status().textContent, "Covered");
  assert.match(status().getAttribute("title") ?? "", /your Black repertoire/);
});

test("marks a partial line for a White player at the move where the repertoire stops", () => {
  seed({ black: "e4 e5" });
  render(<DossierOpeningStatus row={row("e4 e5 Nf3 Nc6")} opponentColor="white" />);
  assert.equal(status().getAttribute("data-status"), "partial");
  assert.equal(status().textContent, "Partial up to 2. Nf3");
});

test("marks a gap for a White player at the move the repertoire cannot answer", () => {
  seed({ black: "e4 e5 Nf3" });
  render(<DossierOpeningStatus row={row("e4 e5 d4 exd4")} opponentColor="white" />);
  assert.equal(status().getAttribute("data-status"), "gap");
  assert.equal(status().textContent, "Gap at 2. d4");
});

test("marks a covered line for a Black player with the user's White repertoire", () => {
  seed({ white: "e4 e5 Nf3 Nc6" });
  render(<DossierOpeningStatus row={row("e4 e5 Nf3 Nc6")} opponentColor="black" />);
  assert.equal(status().getAttribute("data-status"), "covered");
  assert.equal(status().textContent, "Covered");
  assert.match(status().getAttribute("title") ?? "", /your White repertoire/);
});

test("marks a partial line for a Black player at the move where the repertoire stops", () => {
  seed({ white: "e4 e5 Nf3" });
  render(<DossierOpeningStatus row={row("e4 e5 Nf3 Nc6")} opponentColor="black" />);
  assert.equal(status().getAttribute("data-status"), "partial");
  assert.equal(status().textContent, "Partial up to 2…Nc6");
});

test("marks a gap for a Black player at the move the repertoire cannot answer", () => {
  seed({ white: "e4 e5" });
  render(<DossierOpeningStatus row={row("e4 c5 Nf3")} opponentColor="black" />);
  assert.equal(status().getAttribute("data-status"), "gap");
  assert.equal(status().textContent, "Gap at 1…c5");
});

test("uses the repertoire of the opposite colour, not the player's own side", () => {
  seed({ white: "e4 e5 Nf3 Nc6", black: "e4 e5" });
  render(<DossierOpeningStatus row={row("e4 e5 Nf3 Nc6")} opponentColor="white" />);
  // The White tree covers the line; the Black one stops after 1…e5.
  assert.equal(status().getAttribute("data-status"), "partial");
  assert.equal(status().textContent, "Partial up to 2. Nf3");
});

test("renders no status when the user has no repertoire for the needed colour", () => {
  render(<DossierOpeningStatus row={row("e4 e5 Nf3 Nc6")} opponentColor="white" />);
  assert.equal(screen.queryByTestId("dossier-opening-status"), null);
});

test("recomputes when the repertoire tree changes", () => {
  seed({ black: "e4 e5 Nf3 Nc6" });
  render(<DossierOpeningStatus row={row("e4 e5 Nf3 Nc6")} opponentColor="white" />);
  assert.equal(status().textContent, "Covered");

  act(() => seed({ black: "e4 e5" }));
  assert.equal(status().getAttribute("data-status"), "partial");
  assert.equal(status().textContent, "Partial up to 2. Nf3");
});

test("shows the Portuguese status and tooltip", () => {
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } });
  seed({ black: "e4 e5 Nf3" });
  render(<DossierOpeningStatus row={row("e4 e5 d4 exd4")} opponentColor="white" />);
  assert.equal(status().textContent, "Lacuna em 2. d4");
  assert.equal(status().getAttribute("title"), "Cobertura pelo seu repertório de Pretas");
});
