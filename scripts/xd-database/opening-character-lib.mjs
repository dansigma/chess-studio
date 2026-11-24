export const PARAMS = {
  minElo: 2300,
  minYear: 2000,
  dedupePlies: 40,
  maxSample: 200,
  minGames: 30,
  structureStart: 16,
  structureEnd: 60,
  structureStep: 4,
  sharedGames: 4,
  endgamePly: 40,
  minEndgameGames: 20,
};

export const WHITE_SCORE = { "1-0": 1, "1/2-1/2": 0.5, "0-1": 0 };

export function pawnStructure(boardFen) {
  const ranks = boardFen.split("/").map((rank) => rank.replace(/\d/g, (n) => ".".repeat(Number(n))));
  let locked = 0;
  let asymmetric = 0;
  let tension = 0;
  for (let file = 0; file < 8; file += 1) {
    let white = 0;
    let black = 0;
    for (let rank = 0; rank < 8; rank += 1) {
      const piece = ranks[rank][file];
      if (piece === "P") {
        white += 1;
        const ahead = ranks[rank - 1];
        if (ahead?.[file] === "p" && file >= 2 && file <= 5) locked += 1;
        if (ahead?.[file - 1] === "p") tension += 1;
        if (ahead?.[file + 1] === "p") tension += 1;
      } else if (piece === "p") {
        black += 1;
      }
    }
    if (white !== black) asymmetric += 1;
  }
  return { locked, asymmetric, tension };
}

function median(values) {
  values.sort((a, b) => a - b);
  return (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2;
}

function sharedDepth(games) {
  const root = { count: games.length, children: new Map() };
  for (const { moves, anchorPly } of games) {
    let node = root;
    for (let i = anchorPly; i < moves.length; i += 1) {
      const move = moves[i];
      if (!node.children.has(move)) node.children.set(move, { count: 0, children: new Map() });
      node = node.children.get(move);
      node.count += 1;
    }
  }
  return median(games.map(({ moves, anchorPly }) => {
    let node = root;
    let i = anchorPly;
    while (i < moves.length) {
      node = node.children.get(moves[i]);
      if (node.count < PARAMS.sharedGames) break;
      i += 1;
    }
    return i - anchorPly;
  }));
}

export function measureAxes(games) {
  let draws = 0;
  let whiteScore = 0;
  let observed = 0;
  let locked = 0;
  let asymmetric = 0;
  let tension = 0;
  let eligible = 0;
  let queenless = 0;
  for (const game of games) {
    if (game.result === "1/2-1/2") draws += 1;
    whiteScore += WHITE_SCORE[game.result];
    for (const position of game.structure) {
      observed += 1;
      locked += position.locked;
      asymmetric += position.asymmetric;
      tension += position.tension;
    }
    const early = game.queenlessPly !== null && game.queenlessPly <= PARAMS.endgamePly;
    if (early) queenless += 1;
    if (early || game.moves.length >= PARAMS.endgamePly) eligible += 1;
  }
  return {
    n: games.length,
    decisive: 1 - draws / games.length,
    whiteScore: whiteScore / games.length,
    closed: observed ? locked / observed : null,
    asymmetric: observed ? asymmetric / observed : null,
    tension: observed ? tension / observed : null,
    breadth: -sharedDepth(games),
    endgame: eligible >= PARAMS.minEndgameGames ? queenless / eligible : null,
  };
}

export function percentileProfiles(samples) {
  const rows = Array.from(samples)
    .filter(([, games]) => games.length >= PARAMS.minGames)
    .map(([key, games]) => [key, measureAxes(games)])
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const profiles = Object.fromEntries(rows.map(([key, { n }]) => [key, { n }]));
  for (const axis of ["decisive", "closed", "breadth", "endgame"]) {
    const ranked = rows.filter(([, axes]) => axes[axis] !== null)
      .sort(([, a], [, b]) => a[axis] - b[axis]);
    for (const [key] of rows) profiles[key][axis] = null;
    for (let start = 0; start < ranked.length;) {
      let end = start + 1;
      while (end < ranked.length && ranked[end][1][axis] === ranked[start][1][axis]) end += 1;
      const percentile = ranked.length === 1 ? 50 : Math.round(50 * (start + end - 1) / (ranked.length - 1));
      for (let i = start; i < end; i += 1) profiles[ranked[i][0]][axis] = percentile;
      start = end;
    }
  }
  return profiles;
}
