"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bold, Italic, List, Underline } from "lucide-react";
import { sanitizeCourseHtml } from "./description";

type FormatCommand = "bold" | "italic" | "underline" | "insertUnorderedList";

export function DescriptionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [marks, setMarks] = useState({ bold: false, italic: false, underline: false });

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) {
      return;
    }
    const next = sanitizeCourseHtml(value);
    if (el.innerHTML !== next) {
      el.innerHTML = next;
    }
  }, [value]);

  useEffect(() => {
    function sync() {
      const el = ref.current;
      if (!el || !el.contains(document.activeElement)) {
        return;
      }
      setMarks({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      });
    }
    document.addEventListener("selectionchange", sync);
    return () => document.removeEventListener("selectionchange", sync);
  }, []);

  function emit() {
    onChange(sanitizeCourseHtml(ref.current?.innerHTML ?? ""));
  }

  function format(command: FormatCommand) {
    ref.current?.focus();
    document.execCommand(command);
    emit();
  }

  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-studio-border bg-studio-chrome">
      <div className="flex gap-0.5 border-b border-studio-border px-1 py-1">
        <FormatButton label="Bold" active={marks.bold} onClick={() => format("bold")}>
          <Bold size={14} />
        </FormatButton>
        <FormatButton label="Italic" active={marks.italic} onClick={() => format("italic")}>
          <Italic size={14} />
        </FormatButton>
        <FormatButton label="Underline" active={marks.underline} onClick={() => format("underline")}>
          <Underline size={14} />
        </FormatButton>
        <FormatButton label="Bullet list" onClick={() => format("insertUnorderedList")}>
          <List size={14} />
        </FormatButton>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label="Course description"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Write the course description"
        onInput={emit}
        onBlur={emit}
        className="min-h-36 px-3 py-2 text-body text-studio-fg outline-none empty:before:text-studio-faint empty:before:content-[attr(data-placeholder)] [&_em]:italic [&_li+li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}

function FormatButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-studio-fg hover:bg-studio-hover-strong ${
        active ? "bg-studio-hover-strong" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function CourseSummary({ html, className }: { html: string; className?: string }) {
  const safe = sanitizeCourseHtml(html);
  if (!safe) {
    return null;
  }
  return <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
}
