"use client";

import { useState } from "react";
import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import { Dialog } from "@/src/studio/ui/Dialog";
import type { ChessDiagramAttrs } from "./ChessDiagramNode";
import { isValidDiagramFen, MAX_DIAGRAM_CAPTION, safeLinkHref, type DiagramOrientation } from "./description";
import { StudyBoard } from "./ui/StudyBoard";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg";

/** Insert diagram: FEN, orientation, optional caption and a live board preview. */
export function DiagramDialog({
  onInsert,
  onClose,
}: {
  onInsert: (attrs: ChessDiagramAttrs) => void;
  onClose: () => void;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [fen, setFen] = useState(START_FEN);
  const [orientation, setOrientation] = useState<DiagramOrientation>("white");
  const [caption, setCaption] = useState("");
  const cleanFen = fen.trim().replace(/\s+/g, " ");
  const valid = isValidDiagramFen(cleanFen);
  const showError = cleanFen.length > 0 && !valid;

  function submit() {
    if (valid) {
      onInsert({ fen: cleanFen, orientation, caption: caption.trim() });
    }
  }

  return (
    <Dialog
      title={tCourseAdmin(locale, "course.admin.diagram.title")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tCourseAdmin(locale, "course.admin.diagram.cancel")}
          </Button>
          <Button variant="primary" disabled={!valid} onClick={submit}>
            {tCourseAdmin(locale, "course.admin.diagram.insert")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="block text-caption text-studio-muted">
          {tCourseAdmin(locale, "course.admin.diagram.fen")}
          <input
            value={fen}
            onChange={(event) => setFen(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={showError ? true : undefined}
            aria-describedby={showError ? "description-diagram-fen-error" : undefined}
            className={`${INPUT_CLASS} font-mono`}
          />
        </label>
        {showError ? (
          <p id="description-diagram-fen-error" role="alert" className="text-caption text-studio-danger">
            {tCourseAdmin(locale, "course.admin.diagram.fenInvalid")}
          </p>
        ) : null}
        <fieldset>
          <legend className="text-caption text-studio-muted">
            {tCourseAdmin(locale, "course.admin.diagram.orientation")}
          </legend>
          <div className="mt-1 flex gap-1">
            {(["white", "black"] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={orientation === side}
                onClick={() => setOrientation(side)}
                className={`h-8 rounded-lg px-3 text-body text-studio-fg hover:bg-studio-hover-strong ${
                  orientation === side ? "bg-studio-hover-strong" : "bg-studio-chrome"
                }`}
              >
                {tCourseAdmin(locale, side === "white" ? "course.admin.diagram.white" : "course.admin.diagram.black")}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block text-caption text-studio-muted">
          {tCourseAdmin(locale, "course.admin.diagram.caption")}
          <input
            value={caption}
            maxLength={MAX_DIAGRAM_CAPTION}
            onChange={(event) => setCaption(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        {valid ? (
          <div
            role="img"
            aria-label={tCourseAdmin(locale, "course.admin.diagram.preview")}
            className="mx-auto aspect-square w-56 max-w-full"
          >
            <StudyBoard id="description-diagram-preview" fen={cleanFen} orientation={orientation} />
          </div>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Link: an https address applied to the selection (or inserted as the link text when nothing is selected). */
export function LinkDialog({
  initialHref,
  onApply,
  onRemove,
  onClose,
}: {
  initialHref: string;
  onApply: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [href, setHref] = useState(initialHref || "https://");
  const clean = safeLinkHref(href);
  const showError = href.trim().length > "https://".length && !clean;

  function submit() {
    if (clean) {
      onApply(clean);
    }
  }

  return (
    <Dialog
      title={tCourseAdmin(locale, "course.admin.link.title")}
      onClose={onClose}
      footer={
        <>
          {initialHref ? (
            <Button variant="ghost" onClick={onRemove}>
              {tCourseAdmin(locale, "course.admin.link.remove")}
            </Button>
          ) : null}
          <Button variant="primary" disabled={!clean} onClick={submit}>
            {tCourseAdmin(locale, "course.admin.link.apply")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="block text-caption text-studio-muted">
          {tCourseAdmin(locale, "course.admin.link.url")}
          <input
            value={href}
            onChange={(event) => setHref(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            inputMode="url"
            aria-invalid={showError ? true : undefined}
            aria-describedby={showError ? "description-link-error" : undefined}
            className={INPUT_CLASS}
          />
        </label>
        {showError ? (
          <p id="description-link-error" role="alert" className="text-caption text-studio-danger">
            {tCourseAdmin(locale, "course.admin.link.urlInvalid")}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
