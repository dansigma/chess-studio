"use client";

import { tLibrary } from "@/src/i18n/library-strings";
import { useStudioStore } from "@/src/store/studio-store";

/**
 * Status banner shown when one or more Library sources fail during a query,
 * offering a retry action to rerun the query.
 */
export function LibraryPartialNotice({
  failed,
  onRetry,
  textClassName = "text-caption",
}: {
  failed: string[];
  onRetry: () => void;
  textClassName?: string;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <div role="status" className={`flex items-center gap-2 bg-studio-border/30 px-3 py-1 text-studio-muted ${textClassName}`}>
      <span>{tLibrary(locale, "library.partial", { sources: failed.join(", ") })}</span>
      <button type="button" className="text-studio-accent" onClick={onRetry}>
        {tLibrary(locale, "library.error.retry")}
      </button>
    </div>
  );
}
