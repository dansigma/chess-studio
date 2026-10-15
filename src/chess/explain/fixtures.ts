// SIG-961: shared fixtures for the explanation tests — positions reached from
// SAN prefixes, so each case reads like a game fragment.
import { Chess } from "chess.js";
import type { ReviewLabel } from "@/src/chess/review";
import { explainMove, type ExplainInput } from "./explain-move.ts";
import type { Explanation, StatementId } from "./model.ts";

function uci(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export type Scenario = {
  prefix: string;
  move: string;
  /** Engine line from the position before the move, in SAN. */
  best?: string[];
  label: ReviewLabel;
  previous?: ExplainInput["previous"];
};

export function inputFor(scenario: Scenario): ExplainInput {
  const game = new Chess();
  for (const san of scenario.prefix.split(" ").filter(Boolean)) {
    game.move(san);
  }
  const fenBefore = game.fen();
  const played = uci(new Chess(fenBefore).move(scenario.move));
  const line = new Chess(fenBefore);
  const bestPv = (scenario.best ?? []).map((san) => uci(line.move(san)));
  return {
    fenBefore,
    playedUci: played,
    bestPv,
    label: scenario.label,
    lossCp: 300,
    previous: scenario.previous,
    evals: { bestPawns: 1.5, playedPawns: -0.4 },
  };
}

export function explain(scenario: Scenario): Explanation {
  const result = explainMove(inputFor(scenario));
  if (!result) {
    throw new Error("explanation expected");
  }
  return result;
}

export function ids(explanation: Explanation): StatementId[] {
  return explanation.sections.flatMap((section) => section.statements.map((item) => item.id));
}

export const SCENARIOS = {
  foolsMate: { prefix: "f3 e5 g4", move: "Qh4#", best: ["Qh4#"], label: "best" },
  legalMissedMate: {
    prefix: "e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7",
    move: "Kxd1",
    best: ["Nd5#"],
    label: "blunder",
  },
  legalSacrifice: {
    prefix: "e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6",
    move: "Nxe5",
    best: ["Nxe5", "Bxd1", "Bxf7+", "Ke7", "Nd5#"],
    label: "brilliant",
  },
  pinnedKnight: { prefix: "d4 Nf6 c4 e6 Nc3", move: "Bb4", best: ["Bb4"], label: "best" },
  quietMove: { prefix: "", move: "Nf3", best: ["Nf3"], label: "best" },
  attackLoosePawn: { prefix: "e4 e5", move: "Nf3", best: ["Nf3"], label: "best" },
  queenHangs: { prefix: "e4 e5 Qh5 Nc6", move: "Qxe5+", best: ["Nf3"], label: "blunder" },
  forkAllowed: { prefix: "e4 e5 Nf3 Nc6 Bc4 Nf6", move: "Qe2", best: ["Ng5"], label: "blunder" },
  castles: { prefix: "e4 e5 Nf3 Nc6 Bc4 Bc5", move: "O-O", best: ["O-O"], label: "best" },
} satisfies Record<string, Scenario>;
