// SIG-1108: mobile studio bottom-tab string catalog (Moves / Engine / Review /
// Explorer tabs under the board). Strict EN + PT-BR tables via `createT` (same
// grain as src/i18n/studio-sidebar-strings.ts): a missing PT-BR key fails
// `tsc`. Short tab labels only — the panels own their full titles.
import { createT } from "./create-t.ts";

export const MOBILE_STRING_KEYS = [
  "mobile.tabs.label",
  "mobile.tabs.moves",
  "mobile.tabs.engine",
  "mobile.tabs.review",
  "mobile.tabs.explorer",
  "mobile.tabs.more",
  "mobile.more.label",
  "mobile.topbar.backToBoard",
  "mobile.topbar.board",
  "mobile.boards.switch",
  "mobile.boards.sheetTitle",
  "mobile.menu.open",
  "mobile.menu.title",
  "mobile.menu.close",
] as const;

export type MobileStringKey = (typeof MOBILE_STRING_KEYS)[number];

const EN: Record<MobileStringKey, string> = {
  "mobile.tabs.label": "Studio panels",
  "mobile.tabs.moves": "Moves",
  "mobile.tabs.engine": "Engine",
  "mobile.tabs.review": "Review",
  "mobile.tabs.explorer": "Explorer",
  "mobile.tabs.more": "More",
  "mobile.more.label": "More tools",
  "mobile.topbar.backToBoard": "Back to board",
  "mobile.topbar.board": "Board",
  "mobile.boards.switch": "Switch board",
  "mobile.boards.sheetTitle": "Boards",
  "mobile.menu.open": "Open menu",
  "mobile.menu.title": "Menu",
  "mobile.menu.close": "Close menu",
};

const PT_BR: Record<MobileStringKey, string> = {
  "mobile.tabs.label": "Painéis do studio",
  "mobile.tabs.moves": "Lances",
  "mobile.tabs.engine": "Engine",
  "mobile.tabs.review": "Análise",
  "mobile.tabs.explorer": "Explorador",
  "mobile.tabs.more": "Mais",
  "mobile.more.label": "Mais ferramentas",
  "mobile.topbar.backToBoard": "Voltar ao tabuleiro",
  "mobile.topbar.board": "Tabuleiro",
  "mobile.boards.switch": "Trocar tabuleiro",
  "mobile.boards.sheetTitle": "Tabuleiros",
  "mobile.menu.open": "Abrir menu",
  "mobile.menu.title": "Menu",
  "mobile.menu.close": "Fechar menu",
};

export const TABLES = { en: EN, "pt-br": PT_BR } as const;

export const tMobile = createT(EN, PT_BR);
