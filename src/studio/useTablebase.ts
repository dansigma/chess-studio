import { useEffect, useMemo, useState } from "react";
import { fetchTablebase, type TablebaseResult } from "@/src/lib/tablebase/lichess";
import { isTablebasePosition } from "@/src/lib/tablebase/pieces";

export function useTablebase(fen: string | null) {
  const position = useMemo(() => fen && isTablebasePosition(fen) ? { fen } : null, [fen]);
  const [answer, setAnswer] = useState<{ position: typeof position; result: TablebaseResult } | null>(null);

  useEffect(() => {
    if (!position) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await fetchTablebase(position.fen, controller.signal);
      if (!controller.signal.aborted) setAnswer({ position, result });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [position]);

  return answer?.position === position && answer.result.available ? answer.result : null;
}
