"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bold, Italic, List, Underline } from "lucide-react";
import { sanitizeCourseHtml } from "./description";

type FormatCommand = "bold" | "italic" | "underline" | "insertUnorderedList";

const MARK_TAGS: Record<Exclude<FormatCommand, "insertUnorderedList">, string> = {
  bold: "strong",
  italic: "em",
  underline: "u",
};

function editorAncestor(node: Node | null, root: Node): HTMLElement | null {
  let current: Node | null = node instanceof Text ? node.parentElement : (node as HTMLElement | null);
  while (current && current !== root) {
    if (current instanceof HTMLElement) {
      return current;
    }
    current = current.parentNode;
  }
  return root instanceof HTMLElement ? root : null;
}

function hasMark(node: Node | null, tag: string, root: Node): boolean {
  let current: Node | null = node instanceof Text ? node.parentElement : node;
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.tagName.toLowerCase() === tag) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}

function unwrapElement(node: HTMLElement): void {
  const parent = node.parentNode;
  if (!parent) {
    return;
  }
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  parent.removeChild(node);
  parent.normalize();
}

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
      const selection = window.getSelection();
      const anchor = selection?.anchorNode ?? null;
      setMarks({
        bold: hasMark(anchor, "strong", el),
        italic: hasMark(anchor, "em", el),
        underline: hasMark(anchor, "u", el),
      });
    }
    document.addEventListener("selectionchange", sync);
    return () => document.removeEventListener("selectionchange", sync);
  }, []);

  function emit() {
    onChange(sanitizeCourseHtml(ref.current?.innerHTML ?? ""));
  }

  function toggleMark(tag: string) {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) {
      return;
    }
    if (range.collapsed) {
      const existing = editorAncestor(selection.anchorNode, el);
      let styled: HTMLElement | null = null;
      for (let node: HTMLElement | null = existing; node && node !== el; node = node.parentElement) {
        if (node.tagName.toLowerCase() === tag) {
          styled = node;
          break;
        }
      }
      if (styled?.parentNode) {
        const after = document.createRange();
        after.setStartAfter(styled);
        after.collapse(true);
        selection.removeAllRanges();
        selection.addRange(after);
      } else {
        const mark = document.createElement(tag);
        mark.appendChild(document.createTextNode("\u200b"));
        range.insertNode(mark);
        const inner = document.createRange();
        inner.setStart(mark.firstChild!, 1);
        inner.collapse(true);
        selection.removeAllRanges();
        selection.addRange(inner);
      }
    } else if (hasMark(selection.anchorNode, tag, el) || hasMark(selection.focusNode, tag, el)) {
      for (const node of Array.from(el.getElementsByTagName(tag))) {
        try {
          if (node instanceof HTMLElement && range.intersectsNode(node)) {
            unwrapElement(node);
          }
        } catch {
          // Node detached while unwrapping siblings; nothing left to do.
        }
      }
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      const mark = document.createElement(tag);
      try {
        mark.appendChild(range.extractContents());
      } catch {
        return;
      }
      if (!mark.textContent) {
        mark.appendChild(document.createTextNode("\u200b"));
      }
      range.insertNode(mark);
      const next = document.createRange();
      next.selectNodeContents(mark);
      selection.removeAllRanges();
      selection.addRange(next);
    }
    emit();
  }

  function toggleList() {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) {
      return;
    }
    const tops = Array.from(el.childNodes).filter((node) => {
      try {
        return range.intersectsNode(node);
      } catch {
        return false;
      }
    });
    if (tops.length === 0) {
      const list = document.createElement("ul");
      const item = document.createElement("li");
      item.appendChild(document.createTextNode("\u200b"));
      list.appendChild(item);
      range.insertNode(list);
      const caret = document.createRange();
      caret.setStart(item.firstChild!, 1);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
      emit();
      return;
    }
    if (tops.every((node) => node instanceof HTMLElement && node.tagName.toLowerCase() === "ul")) {
      for (const node of tops) {
        const list = node as HTMLElement;
        const plain = document.createElement("div");
        for (const item of Array.from(list.childNodes)) {
          while (item.firstChild) {
            plain.appendChild(item.firstChild);
          }
          plain.appendChild(document.createElement("br"));
        }
        list.replaceWith(plain);
      }
    } else {
      const list = document.createElement("ul");
      const first = tops[0];
      if (!first) {
        return;
      }
      el.insertBefore(list, first);
      for (const node of tops) {
        const item = document.createElement("li");
        if (node instanceof HTMLElement && node.tagName.toLowerCase() === "li") {
          while (node.firstChild) {
            item.appendChild(node.firstChild);
          }
          node.remove();
        } else if (node instanceof HTMLElement && node.tagName.toLowerCase() !== "ul") {
          while (node.firstChild) {
            item.appendChild(node.firstChild);
          }
          node.remove();
        } else if (node.textContent?.trim()) {
          item.textContent = node.textContent;
          node.remove();
        } else {
          item.appendChild(document.createTextNode("\u200b"));
          if (node.parentNode === el) {
            el.removeChild(node);
          }
        }
        if (!item.textContent) {
          item.appendChild(document.createTextNode("\u200b"));
        }
        list.appendChild(item);
      }
      if (!list.hasChildNodes()) {
        list.remove();
        return;
      }
    }
    selection.removeAllRanges();
    selection.addRange(range);
    emit();
  }

  function format(command: FormatCommand) {
    if (command === "insertUnorderedList") {
      toggleList();
      return;
    }
    toggleMark(MARK_TAGS[command]);
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
  // Rendered HTML is parser-sanitized at render (and already at publish), so no raw markup reaches the DOM.
  const safe = sanitizeCourseHtml(html);
  if (!safe) {
    return null;
  }
  return <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
}
