// SIG-1103: pure per-motif summary + weakest-motif picker over
// `PuzzleProgress.motifs`. No React imports — unit-testable in isolation.
import { PUZZLE_THEMES, type PuzzleProgress, type PuzzleTheme } from "./types";

export type MotifTrend = "up" | "down" | "flat" | null;

export type MotifRow = {
  theme: PuzzleTheme;
  attempts: number;
  successPct: number;
  avgSeconds: number | null;
  trend: MotifTrend;
};

function recentSuccessPct(recent: string): number | null {
  if (recent.length === 0) {
    return null;
  }
  let solved = 0;
  for (const char of recent) {
    if (char === "1") {
      solved += 1;
    }
  }
  return (solved / recent.length) * 100;
}

export function motifSummary(progress: PuzzleProgress): MotifRow[] {
  const motifs = progress.motifs ?? {};
  const rows: MotifRow[] = [];
  for (const theme of PUZZLE_THEMES) {
    const stat = motifs[theme];
    if (!stat || stat.attempts <= 0) {
      continue;
    }
    const successPct = Math.round((stat.solved / stat.attempts) * 100);
    const avgSeconds =
      stat.timedAttempts > 0 ? Math.round((stat.totalMs / stat.timedAttempts / 1000) * 10) / 10 : null;
    const recentRate = recentSuccessPct(stat.recent);
    const trend: MotifTrend =
      recentRate === null ? null : recentRate - successPct > 10 ? "up" : successPct - recentRate > 10 ? "down" : "flat";
    rows.push({ theme, attempts: stat.attempts, successPct, avgSeconds, trend });
  }
  rows.sort((a, b) => b.attempts - a.attempts || a.successPct - b.successPct || a.theme.localeCompare(b.theme));
  return rows;
}

export function weakestMotif(progress: PuzzleProgress, minAttempts = 10): PuzzleTheme | null {
  let best: MotifRow | null = null;
  for (const row of motifSummary(progress)) {
    if (row.attempts < minAttempts) {
      continue;
    }
    if (
      !best ||
      row.successPct < best.successPct ||
      (row.successPct === best.successPct && row.attempts > best.attempts) ||
      (row.successPct === best.successPct && row.attempts === best.attempts && row.theme < best.theme)
    ) {
      best = row;
    }
  }
  return best?.theme ?? null;
}
