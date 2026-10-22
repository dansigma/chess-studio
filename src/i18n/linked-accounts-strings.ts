// SIG-1039: linked-accounts section strings (My Games 1/5). Strict EN +
// PT-BR tables via `createT` (same grain as src/i18n/auth-strings.ts): a
// missing PT-BR key fails `tsc`. Brand names (Lichess, Chess.com) are not
// translated.
import { createT } from "./create-t.ts";

export const LINKED_ACCOUNTS_STRING_KEYS = [
  "linkedAccounts.title",
  "linkedAccounts.description",
  "linkedAccounts.lichess",
  "linkedAccounts.chesscom",
  "linkedAccounts.usernamePlaceholder",
  "linkedAccounts.save",
  "linkedAccounts.saving",
  "linkedAccounts.saved",
  "linkedAccounts.remove",
  "linkedAccounts.removing",
  "linkedAccounts.loading",
  "linkedAccounts.error.invalidUsername",
  "linkedAccounts.error.unavailable",
  "linkedAccounts.error.signInRequired",
] as const;

export type LinkedAccountsStringKey = (typeof LINKED_ACCOUNTS_STRING_KEYS)[number];

const EN: Record<LinkedAccountsStringKey, string> = {
  "linkedAccounts.title": "Linked accounts",
  "linkedAccounts.description": "Link your public Lichess and Chess.com usernames to auto-import your games.",
  "linkedAccounts.lichess": "Lichess",
  "linkedAccounts.chesscom": "Chess.com",
  "linkedAccounts.usernamePlaceholder": "Username",
  "linkedAccounts.save": "Save",
  "linkedAccounts.saving": "Saving…",
  "linkedAccounts.saved": "Saved",
  "linkedAccounts.remove": "Remove",
  "linkedAccounts.removing": "Removing…",
  "linkedAccounts.loading": "Loading linked accounts…",
  "linkedAccounts.error.invalidUsername": "Use 2–30 letters, numbers, _ or -.",
  "linkedAccounts.error.unavailable": "Could not save the linked accounts. Try again.",
  "linkedAccounts.error.signInRequired": "Sign in to link your game accounts.",
};

const PT_BR: Record<LinkedAccountsStringKey, string> = {
  "linkedAccounts.title": "Contas vinculadas",
  "linkedAccounts.description": "Vincule seus nomes de usuário públicos do Lichess e Chess.com para importar suas partidas automaticamente.",
  "linkedAccounts.lichess": "Lichess",
  "linkedAccounts.chesscom": "Chess.com",
  "linkedAccounts.usernamePlaceholder": "Nome de usuário",
  "linkedAccounts.save": "Salvar",
  "linkedAccounts.saving": "Salvando…",
  "linkedAccounts.saved": "Salvo",
  "linkedAccounts.remove": "Remover",
  "linkedAccounts.removing": "Removendo…",
  "linkedAccounts.loading": "Carregando contas vinculadas…",
  "linkedAccounts.error.invalidUsername": "Use de 2 a 30 letras, números, _ ou -.",
  "linkedAccounts.error.unavailable": "Não foi possível salvar as contas vinculadas. Tente novamente.",
  "linkedAccounts.error.signInRequired": "Entre para vincular suas contas de jogo.",
};

export const TABLES = { en: EN, "pt-br": PT_BR } as const;

export const tLinkedAccounts = createT(EN, PT_BR);
