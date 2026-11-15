"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bold, Grid3x3, Heading2, Heading3, Italic, Link as LinkIcon, List, Underline } from "lucide-react";
import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { ChessDiagram } from "./ChessDiagramNode";
import { DiagramDialog, LinkDialog } from "./DescriptionDialogs";
import { safeLinkHref, sanitizeCourseHtml } from "./description";

/**
 * SIG-893: Tiptap replaces the bespoke Selection/Range formatter.
 * StarterKit is trimmed to the toolbar surface (bold/italic/underline/
 * bullet list, H2/H3, https links) plus the chess diagram node (SIG-1368);
 * everything else that `sanitizeCourseHtml` would strip (code, quotes,
 * strike, hr) stays disabled so the editor cannot produce markup the
 * pipeline drops. Ordered lists stay
 * enabled for parsing only (no toolbar button): the sanitizer allows
 * `<ol>` and CourseView styles it, so legacy/pasted `<ol>` must survive
 * `setContent`/paste instead of degrading to paragraphs.
 */
const baseExtensions = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    heading: { levels: [2, 3] },
    horizontalRule: false,
    link: {
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      defaultProtocol: "https",
      protocols: ["https"],
      isAllowedUri: (url) => safeLinkHref(url) !== null,
      HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
    },
    strike: false,
    trailingNode: false,
  }),
  ChessDiagram,
];

export function DescriptionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const placeholder = tCourseAdmin(locale, "course.admin.description.placeholder");
  const ariaLabel = tCourseAdmin(locale, "course.admin.description.aria");
  const extensions = useMemo(
    () => [...baseExtensions, Placeholder.configure({ placeholder })],
    [placeholder],
  );
  const editor = useEditor(
    {
      extensions,
      content: sanitizeCourseHtml(value),
      immediatelyRender: false,
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": ariaLabel,
          class:
            "min-h-36 px-3 py-2 text-body text-studio-fg outline-none [&_a]:text-studio-accent [&_a]:underline [&_em]:italic [&_h2]:text-title [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-body [&_h3]:font-semibold [&_h3]:mt-2 [&_li+li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5",
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
  const heading2Active =
    useEditorState({ editor, selector: (snapshot) => snapshot.editor?.isActive("heading", { level: 2 }) ?? false }) ??
    false;
  const heading3Active =
    useEditorState({ editor, selector: (snapshot) => snapshot.editor?.isActive("heading", { level: 3 }) ?? false }) ??
    false;
  const linkActive =
    useEditorState({ editor, selector: (snapshot) => snapshot.editor?.isActive("link") ?? false }) ?? false;
  const [dialog, setDialog] = useState<"diagram" | "link" | null>(null);
  const [linkHref, setLinkHref] = useState("");
  const bulletListActive =
    useEditorState({ editor, selector: (snapshot) => snapshot.editor?.isActive("bulletList") ?? false }) ??
    false;

  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-studio-border bg-studio-chrome">
      <div className="flex gap-0.5 border-b border-studio-border px-1 py-1">
        <FormatButton
          label={tCourseAdmin(locale, "course.admin.toolbar.bold")}
          active={boldActive}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold size={14} />
        </FormatButton>
        <FormatButton
          label={tCourseAdmin(locale, "course.admin.toolbar.italic")}
          active={italicActive}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} />
        </FormatButton>
        <FormatButton
          label={tCourseAdmin(locale, "course.admin.toolbar.underline")}
          active={underlineActive}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <Underline size={14} />
        </FormatButton>
        <FormatButton
          label={tCourseAdmin(locale, "course.admin.toolbar.bullet")}
          active={bulletListActive}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </FormatButton>
        <FormatButton
          label={tCourseAdmin(locale, "course.admin.toolbar.heading2")}
          active={heading2Active}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={14} />
        </FormatButton>
        <FormatButton
          label={tCourseAdmin(locale, "course.admin.toolbar.heading3")}
          active={heading3Active}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={14} />
        </FormatButton>
        <FormatButton
          label={tCourseAdmin(locale, "course.admin.toolbar.link")}
          active={linkActive}
          onClick={() => {
            setLinkHref((editor?.getAttributes("link").href as string | undefined) ?? "");
            setDialog("link");
          }}
        >
          <LinkIcon size={14} />
        </FormatButton>
        <FormatButton
          label={tCourseAdmin(locale, "course.admin.toolbar.diagram")}
          onClick={() => setDialog("diagram")}
        >
          <Grid3x3 size={14} />
        </FormatButton>
      </div>
      <EditorContent
        editor={editor}
        className="tiptap-placeholder [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-studio-faint [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
      />
      {dialog === "diagram" ? (
        <DiagramDialog
          onClose={() => setDialog(null)}
          onInsert={(attrs) => {
            editor?.chain().focus().insertChessDiagram(attrs).run();
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "link" ? (
        <LinkDialog
          initialHref={linkHref}
          onClose={() => setDialog(null)}
          onRemove={() => {
            editor?.chain().focus().extendMarkRange("link").unsetLink().run();
            setDialog(null);
          }}
          onApply={(href) => {
            if (editor) {
              if (editor.isActive("link") || !editor.state.selection.empty) {
                editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
              } else {
                editor
                  .chain()
                  .focus()
                  .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
                  .run();
              }
            }
            setDialog(null);
          }}
        />
      ) : null}
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

