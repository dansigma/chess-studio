"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, Copy, GripVertical, Trash2, Upload } from "lucide-react";
import { formatInteger } from "@/src/i18n/format";
import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { useStudioStore } from "@/src/store/studio-store";
import { IconButton, Button } from "@/src/studio/ui/Button";
import { MAX_CHAPTER_DESCRIPTION_LENGTH } from "./draft";
import { linePgnCheck, linePgnWarningText, type LinePgnWarning } from "./line-check";
import type { CourseChapter, CourseVariation } from "./types";
import { LineMarksEditor } from "./ui/LineMarksEditor";
import { MediaLinkField } from "./ui/MediaLinkField";
import type { LocatedError } from "./validate-draft";

const CHAPTER_DRAG_TYPE = "application/x-chess-studio-chapter";
const LINE_DRAG_TYPE = "application/x-chess-studio-line";
const PGN_CHECK_DEBOUNCE_MS = 300;

function linesLabel(locale: SiteLocale, count: number): string {
  return count === 1
    ? tCourseAdmin(locale, "course.admin.chapter.lines.one")
    : tCourseAdmin(locale, "course.admin.chapter.lines.other", { count: formatInteger(locale, count) });
}

function movesLabel(locale: SiteLocale, count: number): string {
  return count === 1
    ? tCourseAdmin(locale, "course.admin.line.moves.one")
    : tCourseAdmin(locale, "course.admin.line.moves.other", { count: formatInteger(locale, count) });
}

function startDrag(dataTransfer: DataTransfer, type: string, index: number): void {
  dataTransfer.setData(type, String(index));
  dataTransfer.effectAllowed = "move";
}

function hasDragType(dataTransfer: DataTransfer, type: string): boolean {
  return Array.from(dataTransfer.types).includes(type);
}

function dragIndex(dataTransfer: DataTransfer, type: string): number | null {
  const raw = dataTransfer.getData(type);
  if (!raw) {
    return null;
  }
  const index = Number.parseInt(raw, 10);
  return Number.isInteger(index) ? index : null;
}

/** SIG-1366: ↑/↓ on the focused handle reorders one step, reusing the same move callback as the buttons. */
function reorderWithArrow(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  onMove: (index: number, direction: -1 | 1) => void,
): void {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
    return;
  }
  event.preventDefault();
  onMove(index, event.key === "ArrowUp" ? -1 : 1);
}

function LineWarning({ locale, warning }: { locale: SiteLocale; warning?: LinePgnWarning }) {
  if (!warning) {
    return null;
  }
  return (
    <p role="alert" className="mt-1 text-caption text-studio-warning-fg">
      {linePgnWarningText(locale, warning)}
    </p>
  );
}

export function ChapterDraft({
  chapter,
  index,
  total,
  error,
  onTitle,
  onDescription,
  onVideo,
  onMove,
  onReorder,
  onDuplicate,
  onRemove,
  onUpload,
  onAddLine,
  onVariationTitle,
  onVariationPgn,
  onMoveVariation,
  onReorderVariation,
  onDuplicateVariation,
  onRemoveVariation,
}: {
  chapter: CourseChapter;
  index: number;
  total: number;
  /** SIG-1365: the save-time error, shown on this chapter's video field when it points there. */
  error: LocatedError | null;
  onTitle: (title: string) => void;
  onDescription: (description: string) => void;
  onVideo: (videoUrl: string) => void;
  onMove: (direction: -1 | 1) => void;
  /** SIG-1366: drag-and-drop reorder, from source index to target index. */
  onReorder: (from: number, to: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onUpload: (file: File) => void;
  onAddLine: () => void;
  onVariationTitle: (variationId: string, title: string) => void;
  onVariationPgn: (variationId: string, pgn: string) => void;
  onMoveVariation: (index: number, direction: -1 | 1) => void;
  onReorderVariation: (from: number, to: number) => void;
  onDuplicateVariation: (variationId: string) => void;
  onRemoveVariation: (variationId: string) => void;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const fileRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const description = chapter.description ?? "";
  const title = chapter.title.trim();
  const alignTop = collapsed ? "" : "mt-5";
  return (
    <section
      className={`rounded-xl border bg-studio-bg p-4 ${dragOver ? "border-studio-accent" : "border-studio-border"}`}
      onDragOver={(event) => {
        if (!hasDragType(event.dataTransfer, CHAPTER_DRAG_TYPE)) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        const from = dragIndex(event.dataTransfer, CHAPTER_DRAG_TYPE);
        setDragOver(false);
        if (from === null) {
          return;
        }
        event.preventDefault();
        onReorder(from, index);
      }}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className={`flex shrink-0 gap-0.5 ${alignTop}`}>
          <IconButton
            label={tCourseAdmin(locale, "course.admin.chapter.reorder")}
            shortcut="↑/↓"
            aria-keyshortcuts="ArrowUp ArrowDown"
            size="sm"
            draggable
            className="cursor-grab active:cursor-grabbing"
            onDragStart={(event) => startDrag(event.dataTransfer, CHAPTER_DRAG_TYPE, index)}
            onKeyDown={(event) => reorderWithArrow(event, index, (_, direction) => onMove(direction))}
          >
            <GripVertical size={14} />
          </IconButton>
          <IconButton
            label={tCourseAdmin(
              locale,
              collapsed ? "course.admin.chapter.expand" : "course.admin.chapter.collapse",
            )}
            size="sm"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((current) => !current)}
          >
            <ChevronDown size={14} className={collapsed ? "-rotate-90" : ""} />
          </IconButton>
        </div>
        <div className="min-w-0 flex-1">
          {collapsed ? (
            <div className="pt-1">
              <p
                className={`truncate text-body font-semibold ${
                  title ? "text-studio-fg" : "text-studio-faint"
                }`}
              >
                {title || tCourseAdmin(locale, "course.admin.chapter.titlePlaceholder")}
              </p>
              <p className="text-caption text-studio-muted">{linesLabel(locale, chapter.variations.length)}</p>
            </div>
          ) : (
            <label className="block text-caption text-studio-muted">
              {tCourseAdmin(locale, "course.admin.chapter.heading", { n: index + 1 })}
              <input
                value={chapter.title}
                onChange={(event) => onTitle(event.target.value)}
                placeholder={tCourseAdmin(locale, "course.admin.chapter.titlePlaceholder")}
                className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
              />
            </label>
          )}
        </div>
        <div className={`flex shrink-0 flex-wrap items-center justify-end gap-1 ${collapsed ? "pt-1" : alignTop}`}>
          <IconButton
            label={tCourseAdmin(locale, "course.admin.chapter.moveUp")}
            size="sm"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp size={14} />
          </IconButton>
          <IconButton
            label={tCourseAdmin(locale, "course.admin.chapter.moveDown")}
            size="sm"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown size={14} />
          </IconButton>
          <Button
            variant="ghost"
            size="sm"
            aria-label={tCourseAdmin(locale, "course.admin.chapter.duplicate")}
            onClick={onDuplicate}
          >
            <Copy size={14} />
            {tCourseAdmin(locale, "course.admin.duplicate")}
          </Button>
          <IconButton label={tCourseAdmin(locale, "course.admin.chapter.remove")} size="sm" onClick={onRemove}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
      {collapsed ? null : (
        <>
          <div className="mt-3">
            <MediaLinkField
              kind="video"
              field={`chapterVideo:${chapter.id}`}
              label={tCourseAdmin(locale, "course.admin.field.chapterVideo")}
              value={chapter.videoUrl ?? ""}
              error={error}
              onChange={onVideo}
              onRemove={() => onVideo("")}
              placeholder={tCourseAdmin(locale, "course.admin.field.videoPlaceholder")}
            />
          </div>
          <div className="mt-3">
            <label className="block text-caption text-studio-muted">
              {tCourseAdmin(locale, "course.admin.chapter.description")}
              <textarea
                value={description}
                onChange={(event) => onDescription(event.target.value)}
                maxLength={MAX_CHAPTER_DESCRIPTION_LENGTH}
                rows={3}
                aria-describedby={`chapter-description-count-${chapter.id}`}
                className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
              />
            </label>
            <p
              id={`chapter-description-count-${chapter.id}`}
              className="mt-1 text-right text-caption text-studio-faint"
            >
              {tCourseAdmin(locale, "course.admin.chapter.descriptionCounter", {
                count: formatInteger(locale, description.length),
                max: formatInteger(locale, MAX_CHAPTER_DESCRIPTION_LENGTH),
              })}
            </p>
          </div>
          <div className="mt-3 space-y-3">
            {chapter.variations.map((variation, variationIndex) => (
              <LineDraft
                key={variation.id}
                variation={variation}
                index={variationIndex}
                total={chapter.variations.length}
                locale={locale}
                onTitle={(lineTitle) => onVariationTitle(variation.id, lineTitle)}
                onPgn={(pgn) => onVariationPgn(variation.id, pgn)}
                onMove={(lineIndex, direction) => onMoveVariation(lineIndex, direction)}
                onReorder={(from, to) => onReorderVariation(from, to)}
                onDuplicate={() => onDuplicateVariation(variation.id)}
                onRemove={() => onRemoveVariation(variation.id)}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={onAddLine}>
              {tCourseAdmin(locale, "course.admin.line.add")}
            </Button>
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              <Upload size={14} />
              {tCourseAdmin(locale, "course.admin.line.uploadPgn")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".pgn,.txt,text/plain"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  onUpload(file);
                }
              }}
            />
          </div>
          <p className="mt-2 text-caption text-studio-faint">{tCourseAdmin(locale, "course.admin.line.pgnHint")}</p>
        </>
      )}
    </section>
  );
}

function LineDraft({
  variation,
  index,
  total,
  locale,
  onTitle,
  onPgn,
  onMove,
  onReorder,
  onDuplicate,
  onRemove,
}: {
  variation: CourseVariation;
  index: number;
  total: number;
  locale: SiteLocale;
  onTitle: (title: string) => void;
  onPgn: (pgn: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onReorder: (from: number, to: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [check, setCheck] = useState(() => linePgnCheck(variation.pgn));
  const [dragOver, setDragOver] = useState(false);
  const checkedPgn = useRef(variation.pgn);

  // Editing the PGN refreshes the count and warnings after a short pause, so
  // typing stays responsive; blurring checks immediately.
  useEffect(() => {
    if (checkedPgn.current === variation.pgn) {
      return;
    }
    const timer = setTimeout(() => {
      checkedPgn.current = variation.pgn;
      setCheck(linePgnCheck(variation.pgn));
    }, PGN_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [variation.pgn]);

  function recheck() {
    checkedPgn.current = variation.pgn;
    setCheck(linePgnCheck(variation.pgn));
  }

  const title = variation.title.trim();
  const firstWarning = check.warnings[0];
  return (
    <div
      className={`rounded-lg border bg-studio-chrome p-3 ${
        dragOver ? "border-studio-accent" : "border-transparent"
      }`}
      onDragOver={(event) => {
        if (!hasDragType(event.dataTransfer, LINE_DRAG_TYPE)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        const from = dragIndex(event.dataTransfer, LINE_DRAG_TYPE);
        setDragOver(false);
        if (from === null) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onReorder(from, index);
      }}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex shrink-0 gap-0.5">
          <IconButton
            label={tCourseAdmin(locale, "course.admin.line.reorder")}
            shortcut="↑/↓"
            aria-keyshortcuts="ArrowUp ArrowDown"
            size="sm"
            draggable
            className="cursor-grab active:cursor-grabbing"
            onDragStart={(event) => startDrag(event.dataTransfer, LINE_DRAG_TYPE, index)}
            onKeyDown={(event) => reorderWithArrow(event, index, onMove)}
          >
            <GripVertical size={14} />
          </IconButton>
          <IconButton
            label={tCourseAdmin(locale, collapsed ? "course.admin.line.expand" : "course.admin.line.collapse")}
            size="sm"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((current) => !current)}
          >
            <ChevronDown size={14} className={collapsed ? "-rotate-90" : ""} />
          </IconButton>
        </div>
        <div className="min-w-0 flex-1">
          {collapsed ? (
            <div className="pt-1">
              <p className={`truncate text-body ${title ? "text-studio-fg" : "text-studio-faint"}`}>
                {title || tCourseAdmin(locale, "course.admin.line.namePlaceholder")}
              </p>
              <p className="text-caption text-studio-muted">{movesLabel(locale, check.moves)}</p>
              <LineWarning locale={locale} warning={firstWarning} />
            </div>
          ) : (
            <input
              value={variation.title}
              onChange={(event) => onTitle(event.target.value)}
              placeholder={tCourseAdmin(locale, "course.admin.line.namePlaceholder")}
              className="w-full rounded-lg border border-studio-border bg-studio-bg px-3 py-2 text-body text-studio-fg"
            />
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <IconButton
            label={tCourseAdmin(locale, "course.admin.line.moveUp")}
            size="sm"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
          >
            <ChevronUp size={14} />
          </IconButton>
          <IconButton
            label={tCourseAdmin(locale, "course.admin.line.moveDown")}
            size="sm"
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
          >
            <ChevronDown size={14} />
          </IconButton>
          <Button
            variant="ghost"
            size="sm"
            aria-label={tCourseAdmin(locale, "course.admin.line.duplicate")}
            onClick={onDuplicate}
          >
            <Copy size={14} />
            {tCourseAdmin(locale, "course.admin.duplicate")}
          </Button>
          <IconButton label={tCourseAdmin(locale, "course.admin.line.remove")} size="sm" onClick={onRemove}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
      {collapsed ? null : (
        <>
          <textarea
            value={variation.pgn}
            onChange={(event) => onPgn(event.target.value)}
            onBlur={recheck}
            rows={5}
            placeholder="{Opening comment} 1. e4 e5 {Why this move.}"
            className="mt-2 w-full rounded-lg border border-studio-border bg-studio-bg px-3 py-2 font-mono text-dense text-studio-fg"
          />
          <p className="mt-1 text-caption text-studio-muted">{movesLabel(locale, check.moves)}</p>
          <LineWarning locale={locale} warning={firstWarning} />
          <LineMarksEditor
            id={variation.id}
            pgn={variation.pgn}
            locale={locale}
            onPgn={onPgn}
          />
        </>
      )}
    </div>
  );
}
