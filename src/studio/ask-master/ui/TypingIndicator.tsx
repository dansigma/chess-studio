import { tAskMaster } from "@/src/i18n/ask-master-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { MessageBubble } from "./MessageBubble";

export function TypingIndicator({ status, locale }: {
  status: "analyzing" | "answering" | "checking";
  locale: SiteLocale;
}) {
  return (
    <MessageBubble role="assistant" locale={locale}>
      <div className="flex flex-wrap items-center gap-2 text-dense text-studio-muted">
        <span aria-hidden="true" className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-current motion-safe:animate-bounce" />
          <span className="size-1.5 rounded-full bg-current motion-safe:animate-bounce motion-safe:[animation-delay:120ms]" />
          <span className="size-1.5 rounded-full bg-current motion-safe:animate-bounce motion-safe:[animation-delay:240ms]" />
        </span>
        <p>{tAskMaster(locale, status)}</p>
      </div>
    </MessageBubble>
  );
}
