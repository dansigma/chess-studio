import type { StateCreator } from "zustand";
import { fenKey } from "@/src/chess/tree";
import { capEvalCache } from "@/src/lib/eval-cache";
import type {
  EngineEval,
  EnginePreview,
  CachedEval,
  InsightMarks,
  StudioState,
  ThreatMark,
} from "./types";

export type EngineSlice = Pick<
  StudioState,
  | "enginePreview"
  | "engineEval"
  | "evalByFen"
  | "threat"
  | "showThreat"
  | "insightMarks"
  | "setEnginePreview"
  | "setEngineEval"
  | "putEvalCache"
  | "setThreat"
  | "setShowThreat"
  | "setInsightMarks"
>;

export const createEngineSlice: StateCreator<StudioState, [], [], EngineSlice> = (set, get) => ({
  enginePreview: null,
  engineEval: null,
  evalByFen: {},
  threat: null,
  showThreat: false,
  insightMarks: null,
  setEnginePreview: (enginePreview: EnginePreview | null) => set({ enginePreview }),
  setThreat: (threat: ThreatMark | null) => set({ threat }),
  // SIG-959: transient overlay only — never touches `boards`, so no dirty flag.
  setInsightMarks: (insightMarks: InsightMarks | null) => set({ insightMarks }),
  // SIG-906: toggle-off clears the arrow; in-flight cancel is the hook's job.
  setShowThreat: (show: boolean) =>
    set(show ? { showThreat: true } : { showThreat: false, threat: null }),
  setEngineEval: (engineEval: EngineEval | null) => {
    const prev = get().engineEval;
    if (prev?.pawns === engineEval?.pawns && prev?.label === engineEval?.label) {
      return;
    }
    set({ engineEval });
  },
  putEvalCache: (fen: string, value: CachedEval) => {
    const key = fenKey(fen);
    const prev = get().evalByFen[key];
    if (
      prev &&
      (prev.depth > value.depth ||
        (prev.depth === value.depth && prev.pawns === value.pawns && prev.label === value.label))
    ) {
      return;
    }
    // SIG-856: re-insert the key so the write refreshes recency, then cap the
    // map at MAX_EVAL_CACHE_ENTRIES (oldest FENs evicted first).
    const next = { ...get().evalByFen };
    delete next[key];
    next[key] = value;
    set({ evalByFen: capEvalCache(next) });
  },
});
