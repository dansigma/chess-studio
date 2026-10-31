// SIG-1097: "My mistakes" practice-mode string catalog.
// Strict EN + PT-BR tables via `createT` (same grain as
// src/i18n/auth-strings.ts): a missing PT-BR key fails `tsc`. Interpolated
// sentences are whole-sentence templates (`{count}`, `{date}`), never
// concatenation, so Portuguese word order is free.
import { createT, type StringVars } from "./create-t.ts";

export const MISTAKE_STRING_KEYS = [
  "mistakes.dashboard.title",
  "mistakes.dashboard.detail.one",
  "mistakes.dashboard.detail.other",
  "mistakes.dashboard.body",
  "mistakes.dashboard.action",
  "mistakes.dashboard.empty",
  "mistakes.trainer.caughtUp.title",
  "mistakes.trainer.caughtUp.body",
  "mistakes.trainer.caughtUp.nextDue",
  "mistakes.trainer.caughtUp.empty",
  "mistakes.trainer.caughtUp.back",
] as const;

export type MistakeStringKey = (typeof MISTAKE_STRING_KEYS)[number];

export type MistakeMessage = { key: MistakeStringKey; vars?: StringVars };

const EN: Record<MistakeStringKey, string> = {
  "mistakes.dashboard.title": "My mistakes",
  "mistakes.dashboard.detail.one": "{count} exercise due",
  "mistakes.dashboard.detail.other": "{count} exercises due",
  "mistakes.dashboard.body": "Replay the positions where you went wrong. Solving pushes them further out; missing brings them back sooner. It never changes your rating.",
  "mistakes.dashboard.action": "Practice mistakes",
  "mistakes.dashboard.empty": "No saved mistakes yet. Review a game to turn your mistakes into exercises.",
  "mistakes.trainer.caughtUp.title": "All caught up",
  "mistakes.trainer.caughtUp.body": "No mistakes are due right now. Come back later or review another game.",
  "mistakes.trainer.caughtUp.nextDue": "Next exercise due {date}",
  "mistakes.trainer.caughtUp.empty": "No saved mistakes yet. Review a game to turn your mistakes into exercises.",
  "mistakes.trainer.caughtUp.back": "Back to puzzles",
};

const PT_BR: Record<MistakeStringKey, string> = {
  "mistakes.dashboard.title": "Meus erros",
  "mistakes.dashboard.detail.one": "{count} exercício para revisar",
  "mistakes.dashboard.detail.other": "{count} exercícios para revisar",
  "mistakes.dashboard.body": "Reveja as posições em que você errou. Acertar adia a próxima revisão; errar traz de volta para breve. Não muda seu rating.",
  "mistakes.dashboard.action": "Treinar erros",
  "mistakes.dashboard.empty": "Nenhum erro salvo ainda. Analise uma partida para transformar seus erros em exercícios.",
  "mistakes.trainer.caughtUp.title": "Tudo em dia",
  "mistakes.trainer.caughtUp.body": "Nenhum erro para revisar agora. Volte mais tarde ou analise outra partida.",
  "mistakes.trainer.caughtUp.nextDue": "Próximo exercício em {date}",
  "mistakes.trainer.caughtUp.empty": "Nenhum erro salvo ainda. Analise uma partida para transformar seus erros em exercícios.",
  "mistakes.trainer.caughtUp.back": "Voltar aos problemas",
};

export const TABLES = { en: EN, "pt-br": PT_BR } as const;

export const tMistakes = createT(EN, PT_BR);
