import type { Course } from "./types";

const ADVANCE = `[Result "*"]

{The Caro-Kann is a defense against 1.e4. Black prepares to challenge the center with the d-pawn.}
1. e4 {White opens the game. Black prepares a pawn challenge in the center.} c6 {1...c6 clears the way for the d-pawn. Black will challenge the center on the next move.}
2. d4 d5 {Black attacks the e4-pawn.} 3. e5 {The Advance Variation: White closes the center and gains space.}
Bf5 {The bishop steps out before ...e6, so it is not shut in.} 4. c3 {4.c3 supports d4. It is the solid continuation, in the spirit of a French structure with the bishop already outside the chain.}`;

const C4 = `[Result "*"]

{After 3.e5 Bf5, White can also strike at the center at once.}
1. e4 c6 2. d4 d5 3. e5 Bf5 4. c4 {4.c4 gains space and opens the position. Black answers in the center.}
e6 {...e6 reinforces d5 and frees the dark-squared bishop.}`;

const NF3 = `[Result "*"]

{4.Nf3 is the natural development: the knight comes out before White fixes the pawn structure.}
1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 {The knight goes to f3, watching the center and preparing castling.}
e6 {Black completes the base of the variation and gets ready to develop the b8-knight.}`;

const CLASSICAL = `[Result "*"]

{In the Classical variation White does not push the e-pawn. The knight develops and the tension stays.}
1. e4 c6 2. d4 d5 3. Nc3 {3.Nc3 defends e4 and leads to more open play.}
dxe4 {Black trades in the center. The plan continues with ...Bf5 or ...Bg4 after winning the pawn back.}
4. Nxe4 Bf5 {The bishop takes the active diagonal before White drives it away with Ng3.}`;

export const SEED_COURSES: Course[] = [
  {
    id: "caro-kann",
    slug: "caro-kann",
    title: "The Caro-Kann Defense",
    summary:
      "A solid defense against 1.e4. The course starts with the Advance Variation and continues into the Classical, with the explanation of each move beside the board.",
    theme: "openings",
    color: "black",
    builtin: true,
    status: "published",
    accessTier: "free",
    priceCents: null,
    chapters: [
      {
        id: "advance",
        title: "Advance Variation (3.e5)",
        variations: [
          { id: "advance-c3", title: "4.c3 The solid center", pgn: ADVANCE },
          { id: "advance-c4", title: "4.c4 Central aggression", pgn: C4 },
          { id: "advance-nf3", title: "4.Nf3 Natural development", pgn: NF3 },
        ],
      },
      {
        id: "classical",
        title: "Classical Variation (3.Nc3)",
        variations: [{ id: "classical-main", title: "3...dxe4 4.Nxe4 Bf5", pgn: CLASSICAL }],
      },
    ],
  },
];
