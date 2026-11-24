import { createT } from "./create-t.ts";

const EN = {
  title: "Ask the Master",
  close: "Close Ask the Master",
  newQuestion: "New question",
  signInPrompt: "Sign in to ask the Master",
  signIn: "Sign in",
  question: "Your question",
  send: "Send",
  analyzing: "Analyzing the position…",
  answering: "The Master is answering…",
  remainingOne: "{count} question left today",
  remaining: "{count} questions left today",
  userLimit: "You've used your questions for today. Come back tomorrow.",
  siteLimit: "The Master has reached today's limit. Come back tomorrow.",
  rateLimit: "Too many questions in a row. Wait a minute.",
  unavailable: "The Master is unavailable right now. Try again later.",
  disclaimer: "Answers come from AI and may contain errors. Don't share personal information.",
};

type AskMasterStringKey = keyof typeof EN;

const PT_BR: Record<AskMasterStringKey, string> = {
  title: "Pergunte ao Mestre",
  close: "Fechar Pergunte ao Mestre",
  newQuestion: "Nova pergunta",
  signInPrompt: "Entre para perguntar ao Mestre",
  signIn: "Entrar",
  question: "Sua pergunta",
  send: "Enviar",
  analyzing: "Analisando a posição…",
  answering: "O Mestre está respondendo…",
  remainingOne: "{count} pergunta restante hoje",
  remaining: "{count} perguntas restantes hoje",
  userLimit: "Você usou suas perguntas de hoje. Volte amanhã.",
  siteLimit: "O Mestre atingiu o limite de hoje. Volte amanhã.",
  rateLimit: "Muitas perguntas seguidas. Aguarde um minuto.",
  unavailable: "O Mestre está indisponível agora. Tente novamente mais tarde.",
  disclaimer: "As respostas vêm de uma IA e podem conter erros. Não escreva dados pessoais.",
};

export const TABLES = { en: EN, "pt-br": PT_BR } as const;
export const tAskMaster = createT(EN, PT_BR);
