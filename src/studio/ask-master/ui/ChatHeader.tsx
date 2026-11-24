import { ArrowLeft, Crown, History, Maximize2, Minimize2, SquarePen, X } from "lucide-react";
import { tAskMaster } from "@/src/i18n/ask-master-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import type { Ref } from "react";
import { IconButton } from "../../ui/Button";

export function ChatHeader({
  locale, titleId, questionsLeft, history, historyButtonRef, onNew, expanded, onToggleExpanded, onClose,
}: {
  locale: SiteLocale;
  titleId: string;
  questionsLeft: number | null;
  history?: { open: boolean; hasPosition: boolean; onToggle: () => void };
  historyButtonRef: Ref<HTMLButtonElement>;
  onNew?: () => void;
  expanded: boolean;
  onToggleExpanded?: () => void;
  onClose: () => void;
}) {
  const actionClass = "!size-8 !rounded-full !text-studio-accent-fg hover:!bg-studio-accent-hover focus-visible:!outline-studio-accent-fg";
  return (
    <header className="flex shrink-0 items-center gap-2 rounded-t-[inherit] bg-studio-accent-solid px-3 py-3 text-studio-accent-fg">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-studio-accent-fg/15">
        <Crown size={19} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-body font-semibold">{tAskMaster(locale, "title")}</h2>
        <p role="status" className="flex items-baseline gap-1.5 text-caption">
          {questionsLeft !== null && (
            <>
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-studio-success ring-1 ring-studio-accent-fg" />
              {tAskMaster(locale, questionsLeft === 1 ? "remainingOne" : "remaining", { count: questionsLeft })}
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        {history && (
          <IconButton ref={historyButtonRef} className={`${actionClass} relative`}
            label={tAskMaster(locale, history.open ? "historyBack" : "history")}
            aria-describedby={history.hasPosition && !history.open ? titleId + "-history" : undefined}
            onClick={history.onToggle}>
            {history.open ? <ArrowLeft size={16} aria-hidden="true" /> : <History size={16} aria-hidden="true" />}
            {history.hasPosition && !history.open && (
              <span id={titleId + "-history"} role="img" aria-label={tAskMaster(locale, "historyHasPosition")}
                className="absolute right-1 top-1 size-1.5 rounded-full bg-studio-accent-fg" />
            )}
          </IconButton>
        )}
        {onNew && (
          <IconButton className={actionClass} label={tAskMaster(locale, "newQuestion")} onClick={onNew}>
            <SquarePen size={16} aria-hidden="true" />
          </IconButton>
        )}
        {onToggleExpanded && (
          <IconButton className={actionClass} label={tAskMaster(locale, expanded ? "reduce" : "expand")} onClick={onToggleExpanded}>
            {expanded ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          </IconButton>
        )}
        <IconButton className={actionClass} label={tAskMaster(locale, "close")} shortcut="Esc" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </IconButton>
      </div>
    </header>
  );
}
