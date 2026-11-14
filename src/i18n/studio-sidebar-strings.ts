// SIG-1074: studio-sidebar string catalog (Boards, Search,
// Bookmarks sidebars + PlayerHitRow, which renders only inside Search and
// Bookmarks). Strict EN + PT-BR tables via `createT` (same grain as
// src/i18n/studio-chrome-strings.ts): a missing PT-BR key fails `tsc`.
// Interpolated lines are whole-sentence templates (`{name}`, `{count}`,
// `{title}`), never concatenation, so Portuguese word order is free. Brand and
// proper names stay untranslated: Chess.com, Lichess, the PGN
// placeholder `[Event "..."]`, the `Ctrl+N` shortcut hint, the `W`/`B` color
// chips. Sidebar-local `sidebar.*` keys
// intentionally duplicate `chrome.activity.*` values (boards, bookmarks
// titles) so this slice owns its whole surface.
import { createT } from "./create-t.ts";

export const STUDIO_SIDEBAR_STRING_KEYS = [
  "sidebar.boards.title",
  "sidebar.boards.newBoard",
  "sidebar.boards.keep",
  "sidebar.boards.keepName",
  "sidebar.boards.close",
  "sidebar.boards.unsaved",
  "sidebar.boards.previewSuffix",
  "sidebar.boards.startingPosition",
  "sidebar.bookmarks.title",
  "sidebar.bookmarks.empty",
  "sidebar.player.gamesWhite",
  "sidebar.player.gamesBlack",
  "sidebar.player.removeBookmark",
  "sidebar.player.bookmark",
] as const;

export type StudioSidebarStringKey = (typeof STUDIO_SIDEBAR_STRING_KEYS)[number];

const EN: Record<StudioSidebarStringKey, string> = {
  "sidebar.boards.title": "Open boards",
  "sidebar.boards.newBoard": "New board",
  "sidebar.boards.keep": "Keep this board (stop replacing it)",
  "sidebar.boards.keepName": "Keep {title}",
  "sidebar.boards.close": "Close board",
  "sidebar.boards.unsaved": "Unsaved changes",
  "sidebar.boards.previewSuffix": "· preview",
  "sidebar.boards.startingPosition": "starting position",
  "sidebar.bookmarks.title": "Bookmarks",
  "sidebar.bookmarks.empty":
    "No bookmarked players yet. Use the bookmark icon next to a search result.",
  "sidebar.player.gamesWhite": "Games as White",
  "sidebar.player.gamesBlack": "Games as Black",
  "sidebar.player.removeBookmark": "Remove bookmark",
  "sidebar.player.bookmark": "Bookmark player",
};

const PT_BR: Record<StudioSidebarStringKey, string> = {
  "sidebar.boards.title": "Tabuleiros Abertos",
  "sidebar.boards.newBoard": "Novo tabuleiro",
  "sidebar.boards.keep": "Manter este tabuleiro (parar de substituí-lo)",
  "sidebar.boards.keepName": "Manter {title}",
  "sidebar.boards.close": "Fechar tabuleiro",
  "sidebar.boards.unsaved": "Alterações não salvas",
  "sidebar.boards.previewSuffix": "· prévia",
  "sidebar.boards.startingPosition": "Posição inicial",
  "sidebar.bookmarks.title": "Favoritos",
  "sidebar.bookmarks.empty":
    "Sem jogadores favoritados ainda. Use o ícone de favorito ao lado de um resultado de busca.",
  "sidebar.player.gamesWhite": "Partidas de Brancas",
  "sidebar.player.gamesBlack": "Partidas de Pretas",
  "sidebar.player.removeBookmark": "Remover favorito",
  "sidebar.player.bookmark": "Favoritar jogador",
};

export const TABLES = { en: EN, "pt-br": PT_BR } as const;

export const tSidebar = createT(EN, PT_BR);
