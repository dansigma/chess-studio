// SIG-1089: My Games sidebar strings. Strict EN + PT-BR tables via
// `createT` (same grain as `linked-accounts-strings.ts`): a missing PT-BR
// key fails `tsc`. Title values must match `chrome.activity.mygames`
// (asserted in the test) so the activity bar and the panel agree.
import { createT } from "./create-t.ts";

export const MY_GAMES_STRING_KEYS = [
  "myGames.title",
  "myGames.sync",
  "myGames.syncing",
  "myGames.synced.one",
  "myGames.synced.other",
  "myGames.linkAccountHint",
  "myGames.signInHint",
  "myGames.loading",
  "myGames.empty",
  "myGames.loadMore",
  "myGames.error.unavailable",
  "myGames.error.upstream",
] as const;

export type MyGamesStringKey = (typeof MY_GAMES_STRING_KEYS)[number];

const EN: Record<MyGamesStringKey, string> = {
  "myGames.title": "My Games",
  "myGames.sync": "Sync",
  "myGames.syncing": "Syncing…",
  "myGames.synced.one": "Synced {count} new game",
  "myGames.synced.other": "Synced {count} new games",
  "myGames.linkAccountHint":
    "Link your Lichess or Chess.com account in Settings → Linked accounts to import your games.",
  "myGames.signInHint": "Sign in to see your imported games.",
  "myGames.loading": "Loading your games…",
  "myGames.empty": "No imported games yet. Link an account and press Sync.",
  "myGames.loadMore": "Load more",
  "myGames.error.unavailable": "Could not load your games. Try again.",
  "myGames.error.upstream": "One account failed to sync — your other games are shown.",
};

const PT_BR: Record<MyGamesStringKey, string> = {
  "myGames.title": "Minhas partidas",
  "myGames.sync": "Sincronizar",
  "myGames.syncing": "Sincronizando…",
  "myGames.synced.one": "Sincronizada {count} nova partida",
  "myGames.synced.other": "Sincronizadas {count} novas partidas",
  "myGames.linkAccountHint":
    "Vincule sua conta do Lichess ou Chess.com em Configurações → Contas vinculadas para importar suas partidas.",
  "myGames.signInHint": "Entre para ver suas partidas importadas.",
  "myGames.loading": "Carregando suas partidas…",
  "myGames.empty": "Nenhuma partida importada ainda. Vincule uma conta e pressione Sincronizar.",
  "myGames.loadMore": "Carregar mais",
  "myGames.error.unavailable": "Não foi possível carregar suas partidas. Tente novamente.",
  "myGames.error.upstream": "Uma conta falhou ao sincronizar — seus outros jogos são exibidos.",
};

export const TABLES = { en: EN, "pt-br": PT_BR } as const;

export const tMyGames = createT(EN, PT_BR);
