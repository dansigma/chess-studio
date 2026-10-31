// SIG-1101: Opponent prep string catalog (Insights 4/4). Strict EN + PT-BR
// tables via `createT` (same grain as `src/i18n/my-games-strings.ts`): a
// missing PT-BR key fails `tsc`. Interpolated lines are whole-sentence
// templates (`{count}`, `{name}`), never concatenation, so Portuguese word
// order is free. Brand and proper names stay untranslated: Lichess,
// Chess.com.
import { createT } from "./create-t.ts";

export const PREP_STRING_KEYS = [
  "prep.title",
  "prep.source",
  "prep.sourceLichess",
  "prep.sourceChesscom",
  "prep.username",
  "prep.usernamePlaceholder",
  "prep.load",
  "prep.loading",
  "prep.empty",
  "prep.mostPlayed",
  "prep.asWhite",
  "prep.asBlack",
  "prep.games",
  "prep.score",
  "prep.share",
  "prep.prepareAgainst",
  "prep.prepareAgainstHint",
  "prep.gamesAnalyzed.one",
  "prep.gamesAnalyzed.other",
  "prep.error.notFound",
  "prep.error.rateLimited",
  "prep.error.upstream",
  "prep.retry",
] as const;

export type PrepStringKey = (typeof PREP_STRING_KEYS)[number];

const EN: Record<PrepStringKey, string> = {
  "prep.title": "Opponent prep",
  "prep.source": "Source",
  "prep.sourceLichess": "Lichess",
  "prep.sourceChesscom": "Chess.com",
  "prep.username": "Username",
  "prep.usernamePlaceholder": "Opponent username",
  "prep.load": "Load",
  "prep.loading": "Loading opponent games…",
  "prep.empty": "Type a username and press Load to see their openings.",
  "prep.mostPlayed": "Most played",
  "prep.asWhite": "As White",
  "prep.asBlack": "As Black",
  "prep.games": "Games",
  "prep.score": "Score",
  "prep.share": "Share",
  "prep.prepareAgainst": "Prepare against",
  "prep.prepareAgainstHint": "Open this line on a new board with the Explorer",
  "prep.gamesAnalyzed.one": "{count} game analyzed",
  "prep.gamesAnalyzed.other": "{count} games analyzed",
  "prep.error.notFound": "No public games found for this username.",
  "prep.error.rateLimited": "Too many requests — wait a moment and try again.",
  "prep.error.upstream": "Could not load the opponent profile. Try again.",
  "prep.retry": "Retry",
};

const PT_BR: Record<PrepStringKey, string> = {
  "prep.title": "Preparação contra",
  "prep.source": "Fonte",
  "prep.sourceLichess": "Lichess",
  "prep.sourceChesscom": "Chess.com",
  "prep.username": "Nome de usuário",
  "prep.usernamePlaceholder": "Nome do adversário",
  "prep.load": "Carregar",
  "prep.loading": "Carregando partidas do adversário…",
  "prep.empty": "Digite um nome de usuário e pressione Carregar para ver as aberturas.",
  "prep.mostPlayed": "Mais jogadas",
  "prep.asWhite": "De Brancas",
  "prep.asBlack": "De Pretas",
  "prep.games": "Partidas",
  "prep.score": "Aproveitamento",
  "prep.share": "Fatia",
  "prep.prepareAgainst": "Preparar contra",
  "prep.prepareAgainstHint": "Abrir esta linha em um novo tabuleiro com o Explorador",
  "prep.gamesAnalyzed.one": "{count} partida analisada",
  "prep.gamesAnalyzed.other": "{count} partidas analisadas",
  "prep.error.notFound": "Nenhuma partida pública encontrada para este usuário.",
  "prep.error.rateLimited": "Pedidos demais — aguarde um momento e tente de novo.",
  "prep.error.upstream": "Não foi possível carregar o perfil do adversário. Tente de novo.",
  "prep.retry": "Tentar de novo",
};

export const TABLES = { en: EN, "pt-br": PT_BR } as const;

export const tPrep = createT(EN, PT_BR);
