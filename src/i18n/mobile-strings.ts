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
] as const;

export type MobileStringKey = (typeof MOBILE_STRING_KEYS)[number];

const EN: Record<MobileStringKey, string> = {
  "mobile.tabs.label": "Studio panels",
  "mobile.tabs.moves": "Moves",
  "mobile.tabs.engine": "Engine",
  "mobile.tabs.review": "Review",
  "mobile.tabs.explorer": "Explorer",
};

const PT_BR: Record<MobileStringKey, string> = {
  "mobile.tabs.label": "Painéis do studio",
  "mobile.tabs.moves": "Lances",
  "mobile.tabs.engine": "Motor",
  "mobile.tabs.review": "Análise",
  "mobile.tabs.explorer": "Explorador",
};

export const TABLES = { en: EN, "pt-br": PT_BR } as const;

export const tMobile = createT(EN, PT_BR);
