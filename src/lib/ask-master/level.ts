export const ASK_MASTER_LEVELS = ["u1600", "1600-2000", "2000+"] as const;

export type AskMasterLevel = (typeof ASK_MASTER_LEVELS)[number];

export const DEFAULT_ASK_MASTER_LEVEL: AskMasterLevel = "1600-2000";

export function isAskMasterLevel(value: unknown): value is AskMasterLevel {
  return ASK_MASTER_LEVELS.some((level) => level === value);
}
