const INTENTS = ["explain", "model-games", "study-opening", "free"] as const;

export type AskMasterIntent = typeof INTENTS[number];

export function isAskMasterIntent(value: unknown): value is AskMasterIntent {
  return INTENTS.some((intent) => intent === value);
}
