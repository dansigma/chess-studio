import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Crown } from "lucide-react";
import { tAskMaster } from "@/src/i18n/ask-master-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { IconButton } from "../../ui/Button";

export function MessageBubble({ role, locale, createdAt, answer, children }: {
  role: "user" | "assistant";
  locale: SiteLocale;
  createdAt?: number;
  answer?: string;
  children: ReactNode;
}) {
  const time = useMemo(() => createdAt === undefined ? null : (
    <time dateTime={new Date(createdAt).toISOString()} className="text-caption tabular-nums">
      {new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(createdAt)}
    </time>
  ), [createdAt, locale]);

  if (role === "user") {
    return (
      <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm bg-studio-accent-solid px-3 py-2 text-studio-accent-fg">
        <p className="whitespace-pre-wrap">{children}</p>
        {time && <div className="mt-1 text-right">{time}</div>}
      </div>
    );
  }

  return (
    <div className="mr-4 flex items-start gap-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-studio-accent-soft text-studio-accent-text">
        <Crown size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-studio-border-subtle bg-studio-elevated px-3 py-2">
        <div className="mb-1 flex min-h-6 items-center gap-2 text-studio-muted">
          <span className="text-dense font-semibold text-studio-fg">{tAskMaster(locale, "master")}</span>
          {time}
          {answer !== undefined && <CopyAnswer answer={answer} locale={locale} />}
        </div>
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}

function CopyAnswer({ answer, locale }: { answer: string; locale: SiteLocale }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    const plainText = answer
      .replace(/\[\[([^\r\n]*?)\]\]/g, "$1")
      .replace(/\{\{game:[^{}\r\n]*\}\}/g, "")
      .replace(/^ {0,3}###[ \t]+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .trim();
    try {
      await navigator.clipboard.writeText(plainText);
    } catch {
      return;
    }
    if (!active.current) return;
    clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <IconButton size="sm" label={tAskMaster(locale, copied ? "copied" : "copy")} className="ml-auto" onClick={() => void copy()}>
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </IconButton>
  );
}
