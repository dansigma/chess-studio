import type { PieceType, ThreatRef } from "../model";
import { formatPawns, joinList } from "./format";
import type { LocaleTable, RenderContext } from "./types";

// Brazilian Portuguese. Piece names carry grammatical gender, so every sentence
// is written whole and agrees explicitly (articles, contractions, participles)
// instead of splicing a piece name into a fixed fragment.
const PIECE: Record<PieceType, { name: string; fem: boolean }> = {
  p: { name: "peão", fem: false },
  n: { name: "cavalo", fem: false },
  b: { name: "bispo", fem: false },
  r: { name: "torre", fem: true },
  q: { name: "dama", fem: true },
  k: { name: "rei", fem: false },
};

/** "o cavalo" / "a torre". */
const art = (type: PieceType): string => `${PIECE[type].fem ? "a" : "o"} ${PIECE[type].name}`;
/** "do cavalo" / "da torre". */
const ofThe = (type: PieceType): string => `${PIECE[type].fem ? "da" : "do"} ${PIECE[type].name}`;
/** "pelo cavalo" / "pela torre". */
const byThe = (type: PieceType): string => `${PIECE[type].fem ? "pela" : "pelo"} ${PIECE[type].name}`;
/** Picks the masculine or feminine form of a participle/adjective for a piece. */
const agree = (type: PieceType, masculine: string, feminine: string): string => (PIECE[type].fem ? feminine : masculine);
const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const san = (value: string, context: RenderContext): string => context.formatSan?.(value) ?? value;
const squares = (list: string[]): string => joinList(list, "e");

function threatCreated(threat: ThreatRef): string {
  switch (threat.kind) {
    case "mate-in-1":
      return "Ameaça dar xeque-mate no próximo lance.";
    case "hanging-capture":
      return `Ameaça capturar a peça sem proteção em ${squares(threat.targets)}.`;
    case "winning-capture":
      return `Ameaça uma captura que ganha material em ${squares(threat.targets)}.`;
    case "fork":
      return `Prepara um garfo contra ${squares(threat.targets)}.`;
  }
}

function threatParried(threat: ThreatRef): string {
  switch (threat.kind) {
    case "mate-in-1":
      return "Evita a ameaça de xeque-mate.";
    case "hanging-capture":
    case "winning-capture":
      return `Elimina a ameaça contra a peça em ${squares(threat.targets)}.`;
    case "fork":
      return `Desfaz o garfo dirigido a ${squares(threat.targets)}.`;
  }
}

function bestThreat(threat: ThreatRef, move: string): string {
  switch (threat.kind) {
    case "mate-in-1":
      return `${move} ameaça dar xeque-mate no próximo lance.`;
    case "hanging-capture":
      return `${move} ameaça a peça sem proteção em ${squares(threat.targets)}.`;
    case "winning-capture":
      return `${move} ameaça uma captura que ganha material em ${squares(threat.targets)}.`;
    case "fork":
      return `${move} prepara um garfo contra ${squares(threat.targets)}.`;
  }
}

function bestParry(threat: ThreatRef, move: string): string {
  switch (threat.kind) {
    case "mate-in-1":
      return `${move} evita a ameaça de xeque-mate.`;
    case "hanging-capture":
    case "winning-capture":
      return `${move} resolve a ameaça contra a peça em ${squares(threat.targets)}.`;
    case "fork":
      return `${move} desfaz o garfo dirigido a ${squares(threat.targets)}.`;
  }
}

export const PT_BR: LocaleTable = {
  pieceName: { p: "peão", n: "cavalo", b: "bispo", r: "torre", q: "dama", k: "rei" },
  sections: {
    move: "O que o lance faz",
    consequences: "O que ele permite",
    alternative: "Uma opção melhor",
  },
  ui: {
    why: "Por quê?",
    bestLine: "Melhor linha",
    engineOnly: "Nenhum motivo claro pôde ser comprovado pela posição; esta é apenas a visão do motor.",
    noLine: "Não há linha do motor para este lance.",
  },
  summary: (summary, context) => {
    const played = san(summary.playedSan, context);
    if (summary.bestSan === null) {
      return `${played} foi jogado; o motor não tem uma linha para ele.`;
    }
    const best = san(summary.bestSan, context);
    const bestEval = summary.bestPawns === null ? "" : ` (${formatPawns(summary.bestPawns, ",")})`;
    if (summary.playedIsBest) {
      return `${played} é a primeira escolha do motor${bestEval}.`;
    }
    const playedEval =
      summary.playedPawns === null ? "" : ` e a avaliação fica em ${formatPawns(summary.playedPawns, ",")}`;
    return `O motor prefere ${best}${bestEval}; foi jogado ${played}${playedEval}.`;
  },
  statements: {
    captures: (p) => `${cap(art(p.piece))} captura ${art(p.victim)} em ${p.square}.`,
    recaptures: (p) => `${cap(art(p.piece))} recaptura ${art(p.victim)} em ${p.square}.`,
    castles: (p) => (p.side === "k" ? "Roque pequeno." : "Roque grande."),
    promotes: (p) => `O peão é promovido a ${PIECE[p.to].name} em ${p.square}.`,
    "gives-check": (p) => `${cap(art(p.piece))} dá xeque a partir de ${p.square}.`,
    "gives-mate": (p) => `${cap(art(p.piece))} dá xeque-mate em ${p.square}.`,
    "attacks-loose-piece": (p) =>
      `${cap(art(p.piece))} agora ataca ${art(p.target)} em ${p.square}, que não está ${agree(p.target, "bem protegido", "bem protegida")}.`,
    "attacks-valuable-piece": (p) => `${cap(art(p.piece))} agora ataca ${art(p.target)} em ${p.square}, uma peça de maior valor.`,
    "defends-attacked-piece": (p) =>
      `Reforça a proteção ${ofThe(p.piece)} ${agree(p.piece, "atacado", "atacada")} em ${p.square}.`,
    "creates-threat": (p) => threatCreated(p),
    "neutralizes-threat": (p) => threatParried(p),
    "uses-open-file": (p) =>
      p.openness === "open" ? `Coloca uma peça pesada na coluna ${p.file} aberta.` : `Coloca uma peça pesada na coluna ${p.file} semiaberta.`,
    "uses-diagonal": (p) => `Assume o controle da grande diagonal ${p.diagonal === "a1h8" ? "a1–h8" : "h1–a8"}.`,
    "takes-seventh-rank": (p) => `Chega à sétima fileira com uma peça pesada, em ${p.square}.`,
    "attacks-pinned-piece": (p) =>
      p.pin === "absolute"
        ? `Ataca ${art(p.target)} em ${p.square}, ${agree(p.target, "cravado", "cravada")} contra o rei.`
        : `Ataca ${art(p.target)} em ${p.square}, ${agree(p.target, "cravado", "cravada")} a uma peça mais valiosa.`,
    "breaks-pin": (p) => `Liberta ${art(p.piece)} ${agree(p.piece, "cravado", "cravada")} em ${p.square}.`,
    "creates-xray": (p) => `Cria um raio-X através ${ofThe(p.through)} contra ${art(p.target)} em ${p.targetSquare}.`,
    "weakens-king": (p) => `Enfraquece a proteção de peões diante do rei que fez roque, em ${p.square}.`,
    "gives-up-material": (p) => `Oferece ${art(p.piece)} em ${p.square} como sacrifício.`,
    "sacrifice-leads-to-mate": () => "A linha do motor por trás dele termina em xeque-mate.",
    "sacrifice-regains-material": () => "A linha do motor recupera o material.",
    "allows-mate": (p) => `Permite xeque-mate com um lance de ${p.from} para ${p.to}.`,
    "allows-capture": (p) =>
      `Deixa ${art(p.victim)} em ${p.square} ${agree(p.victim, "sujeito", "sujeita")} à captura ${byThe(p.attacker)}.`,
    "allows-fork": (p) => `Permite um garfo: ${art(p.attacker)} do adversário pode ir para ${p.to}.`,
    "leaves-undefended": (p) => `Deixa ${art(p.piece)} em ${p.square} sem proteção adequada.`,
    "moves-into-attack": (p) =>
      `${cap(art(p.piece))} vai para ${p.square}, onde é ${agree(p.piece, "atacado", "atacada")} sem proteção suficiente.`,
    "best-alternative": (p, c) => `Melhor era ${san(p.san, c)}.`,
    "best-gives-mate": (p, c) => `${san(p.san, c)} dá xeque-mate.`,
    "best-line-mates": (p, c) => `${san(p.san, c)} leva a um xeque-mate forçado na linha do motor.`,
    "best-captures": (p, c) => `${san(p.san, c)} captura ${art(p.victim)} em ${p.square}.`,
    "best-gives-check": (p, c) => `${san(p.san, c)} dá xeque.`,
    "best-creates-threat": (p, c) => bestThreat(p, san(p.san, c)),
    "best-neutralizes-threat": (p, c) => bestParry(p, san(p.san, c)),
    "best-line-wins-material": (p, c) =>
      `A linha do motor depois de ${san(p.san, c)} rende cerca de ${p.points} ${p.points === 1 ? "ponto" : "pontos"} de material.`,
  },
};
