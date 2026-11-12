// SIG-1290: Live broadcasts list strings. Strict EN + PT-BR tables via `createT`.
import { createT } from "./create-t.ts";

export const LIVE_STRING_KEYS = [
  "live.title",
  "live.poweredBy",
  "live.section.active",
  "live.section.upcoming",
  "live.section.past",
  "live.item.live",
  "live.item.startsAt",
  "live.item.nextRound",
  "live.item.imageAlt",
  "live.loading",
  "live.empty",
  "live.error.title",
  "live.error.retry",
  "live.loadMore",
  "live.loadingMore",
  "live.loadMoreError",
  "live.round.back",
  "live.round.title",
  "live.round.placeholder",
] as const;

export type LiveStringKey = (typeof LIVE_STRING_KEYS)[number];

const EN: Record<LiveStringKey, string> = {
  "live.title": "Broadcasts",
  "live.poweredBy": "Powered by Lichess",
  "live.section.active": "Live now",
  "live.section.upcoming": "Upcoming",
  "live.section.past": "Finished",
  "live.item.live": "Live",
  "live.item.startsAt": "Starts {date}",
  "live.item.nextRound": "{round} · {date}",
  "live.item.imageAlt": "{name} cover",
  "live.loading": "Loading broadcasts",
  "live.empty": "No broadcasts are live right now.",
  "live.error.title": "Could not load the broadcasts.",
  "live.error.retry": "Try again",
  "live.loadMore": "Load more",
  "live.loadingMore": "Loading…",
  "live.loadMoreError": "Could not load more. Try again.",
  "live.round.back": "Back to broadcasts",
  "live.round.title": "Round {id}",
  "live.round.placeholder": "The round view is coming soon.",
};

const PT_BR: Record<LiveStringKey, string> = {
  "live.title": "Transmissões",
  "live.poweredBy": "Powered by Lichess",
  "live.section.active": "Ao vivo agora",
  "live.section.upcoming": "Em breve",
  "live.section.past": "Encerrados",
  "live.item.live": "Ao vivo",
  "live.item.startsAt": "Começa {date}",
  "live.item.nextRound": "{round} · {date}",
  "live.item.imageAlt": "Capa de {name}",
  "live.loading": "Carregando transmissões",
  "live.empty": "Nenhuma transmissão ao vivo agora.",
  "live.error.title": "Não foi possível carregar as transmissões.",
  "live.error.retry": "Tentar novamente",
  "live.loadMore": "Carregar mais",
  "live.loadingMore": "Carregando…",
  "live.loadMoreError": "Não foi possível carregar mais. Tente novamente.",
  "live.round.back": "Voltar às transmissões",
  "live.round.title": "Rodada {id}",
  "live.round.placeholder": "A visualização da rodada chega em breve.",
};

export const tLive = createT(EN, PT_BR);
