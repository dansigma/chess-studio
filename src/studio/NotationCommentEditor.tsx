"use client";

import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { Button } from "./ui/Button";

export function NotationCommentEditor({
  commentBefore,
  moveLabel,
  locale = "en",
  value,
  onChange,
  onCommit,
  onClose,
}: {
  commentBefore: boolean;
  moveLabel: string;
  locale?: SiteLocale;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="border-t border-studio-border bg-studio-chrome p-3">
      <div className="mb-1.5 text-caption uppercase tracking-wider text-studio-faint">
        {commentBefore ? tPanels(locale, "comment.before") : tPanels(locale, "comment.title")} · {moveLabel}
      </div>
      <textarea
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onCommit();
            onClose();
          }
        }}
        placeholder={
          commentBefore
            ? tPanels(locale, "comment.placeholderBefore")
            : tPanels(locale, "comment.placeholder")
        }
        className="h-24 w-full resize-none rounded-md border border-studio-border-strong bg-studio-panel px-2 py-1.5 text-body text-studio-fg outline-none focus:border-studio-accent"
        autoFocus
      />
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            onCommit();
            onClose();
          }}
        >
          {tPanels(locale, "comment.done")}
        </Button>
      </div>
    </div>
  );
}
