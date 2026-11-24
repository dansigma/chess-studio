import { useId, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import { tAskMaster } from "@/src/i18n/ask-master-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { Button } from "../../ui/Button";
import { MAX_QUESTION_LENGTH } from "../ask-master-store";
import { LevelChip } from "./LevelChip";

export function ChatComposer({ locale, question, disabled, onChange, onSend }: {
  locale: SiteLocale;
  question: string;
  disabled: boolean;
  onChange: (question: string) => void;
  onSend: () => void;
}) {
  const questionId = useId();
  const disclaimerId = useId();
  const canSend = !disabled && Boolean(question.trim());

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) onSend();
  }

  return (
    <form className="shrink-0 space-y-2 border-t border-studio-border-subtle px-3 pt-2.5 pb-3" onSubmit={submit}>
      <div className="flex items-end gap-2">
        <LevelChip locale={locale} />
        <div className="flex min-w-0 flex-1 items-end gap-1 rounded-[1.375rem] border border-studio-border-strong bg-studio-elevated p-1 focus-within:border-studio-accent-text">
          <label className="sr-only" htmlFor={questionId}>{tAskMaster(locale, "question")}</label>
          <textarea
            id={questionId}
            aria-describedby={disclaimerId}
            className="my-1 max-h-24 min-h-6 min-w-0 flex-1 field-sizing-content resize-none overflow-y-auto px-2 text-base leading-6 text-studio-fg outline-none! placeholder:text-studio-muted"
            placeholder={tAskMaster(locale, "question")}
            rows={1}
            maxLength={MAX_QUESTION_LENGTH}
            value={question}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
          />
          <Button type="submit" variant="primary" aria-label={tAskMaster(locale, "send")} disabled={!canSend}
            className="!size-8 shrink-0 !rounded-full !p-0">
            <ArrowUp size={17} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p id={disclaimerId} className="text-center text-caption text-studio-muted">{tAskMaster(locale, "disclaimer")}</p>
    </form>
  );
}
