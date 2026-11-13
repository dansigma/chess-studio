// SIG-1307: how many saved exercises exist per tier x phase, for the
// "Train" actions in My Stats. Pure. Opponent mistakes are excluded (they are
// not the user's own mistakes).
import type { GamePhase } from "@/src/chess/phases";
import type { MistakeExercise } from "@/src/chess/mistake-exercises";
import type { MistakeExercisesMap } from "./mistake-exercises-store";

export type ExerciseCounts = Record<GamePhase, Record<MistakeExercise["label"], number>>;

export function exerciseCountsByPhase(map: MistakeExercisesMap): ExerciseCounts {
  const counts: ExerciseCounts = {
    opening: { miss: 0, mistake: 0, blunder: 0 },
    middlegame: { miss: 0, mistake: 0, blunder: 0 },
    endgame: { miss: 0, mistake: 0, blunder: 0 },
  };
  for (const entry of Object.values(map)) {
    const exercise = entry?.exercise;
    if (!exercise || exercise.fromOpponent === true) {
      continue;
    }
    const bucket = counts[exercise.phase]?.[exercise.label];
    if (bucket !== undefined) {
      counts[exercise.phase][exercise.label] = bucket + 1;
    }
  }
  return counts;
}
