"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, type ReactNode } from "react";
import { Bold, Italic, List, Underline } from "lucide-react";
import { sanitizeCourseHtml } from "./description";

/**
 * SIG-893: Tiptap replaces the bespoke Selection/Range formatter.
 * StarterKit is trimmed to the toolbar surface (bold/italic/underline/
 * bullet list); everything else that `sanitizeCourseHtml` would strip
 * (headings, code, quotes, links, strike, hr) stays disabled so the
 * editor cannot produce markup the pipeline drops. Ordered lists stay
 * enabled for parsing only (no toolbar button): the sanitizer allows
 * `<ol>` and CourseView styles it, so legacy/pasted `<ol>` must survive
 * `setContent`/paste instead of degrading to paragraphs.
 */
const extensions = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    heading: false,
    horizontalRule: false,
    link: false,
    strike: false,
    trailingNode: false,
  }),
  Placeholder.configure({
    placeholder: "Write the course description",
  }),
];

export function DescriptionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor(
    {
      extensions,
      content: sanitizeCourseHtml(value),
      immediatelyRender: false,
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": "Course description",
          class:
            "min-h-36 px-3 py-2 text-body text-studio-fg outline-none [&_em]:italic [&_li+li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5",
        },
      },
      onUpdate: ({ editor }) => {
        onChange(sanitizeCourseHtml(editor.getHTML()));
      },
      onBlur: ({ editor }) => {
        onChange(sanitizeCourseHtml(editor.getHTML()));
      },
    },
    [],
  );

  useEffect(() => {
    if (!editor || editor.isFocused) {
      return;
    }
    const next = sanitizeCourseHtml(value);
    if (sanitizeCourseHtml(editor.getHTML()) !== next) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  const boldActive =
    useEditorState({ editor, selector: (snapshot) => snapshot.editor?.isActive("bold") ?? false }) ?? false;
  const italicActive =
    useEditorState({ editor, selector: (snapshot) => snapshot.editor?.isActive("italic") ?? false }) ?? false;
  const underlineActive =
    useEditorState({ editor, selector: (snapshot) => snapshot.editor?.isActive("underline") ?? false }) ?? false;
  const bulletListActive =
    useEditorState({ editor, selector: (snapshot) => snapshot.editor?.isActive("bulletList") ?? false }) ??
    false;

  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-studio-border bg-studio-chrome">
      <div className="flex gap-0.5 border-b border-studio-border px-1 py-1">
        <FormatButton label="Bold" active={boldActive} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold size={14} />
        </FormatButton>
        <FormatButton
          label="Italic"
          active={italicActive}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} />
        </FormatButton>
        <FormatButton
          label="Underline"
          active={underlineActive}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <Underline size={14} />
        </FormatButton>
        <FormatButton
          label="Bullet list"
          active={bulletListActive}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </FormatButton>
      </div>
      <EditorContent
        editor={editor}
        className="tiptap-placeholder [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-studio-faint [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
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
