// SIG-1274: Library view strings. Strict EN + PT-BR tables via `createT`; a
// missing PT-BR key fails `tsc`. The other Library issues append keys here.
import { createT } from "./create-t.ts";

export const LIBRARY_STRING_KEYS = [
  "library.title",
  "library.toolbar.label",
  "library.table.label",
  "library.preview.label",
  "library.preview.select",
  "library.resize",
  "library.loading",
  "library.loadMore",
  "library.loadingMore",
  "library.total",
  "library.empty.noMatch",
  "library.empty.clearFilters",
  "library.empty.noSources",
  "library.error.title",
  "library.error.retry",
  "library.partial",
] as const;

export type LibraryStringKey = (typeof LIBRARY_STRING_KEYS)[number];

const EN: Record<LibraryStringKey, string> = {
  "library.title": "Library",
  "library.toolbar.label": "Library toolbar",
  "library.table.label": "Games",
  "library.preview.label": "Game preview",
  "library.preview.select": "Select a game",
  "library.resize": "Resize preview",
  "library.loading": "Loading games",
  "library.loadMore": "Load more",
  "library.loadingMore": "Loading…",
  "library.total": "{count} games",
  "library.empty.noMatch": "No games match these filters.",
  "library.empty.clearFilters": "Clear filters",
  "library.empty.noSources": "No sources available. Import a PGN or link an account to fill the Library.",
  "library.error.title": "Could not load games: {message}",
  "library.error.retry": "Try again",
  "library.partial": "Some sources failed and are not shown: {sources}.",
};

const PT_BR: Record<LibraryStringKey, string> = {
  "library.title": "Biblioteca",
  "library.toolbar.label": "Barra da Biblioteca",
  "library.table.label": "Partidas",
  "library.preview.label": "Prévia da partida",
  "library.preview.select": "Selecione uma partida",
  "library.resize": "Redimensionar prévia",
  "library.loading": "Carregando partidas",
  "library.loadMore": "Carregar mais",
  "library.loadingMore": "Carregando…",
  "library.total": "{count} partidas",
  "library.empty.noMatch": "Nenhuma partida corresponde a estes filtros.",
  "library.empty.clearFilters": "Limpar filtros",
  "library.empty.noSources":
    "Nenhuma fonte disponível. Importe um PGN ou vincule uma conta para preencher a Biblioteca.",
  "library.error.title": "Não foi possível carregar as partidas: {message}",
  "library.error.retry": "Tentar novamente",
  "library.partial": "Algumas fontes falharam e não são exibidas: {sources}.",
};

export const tLibrary = createT(EN, PT_BR);
