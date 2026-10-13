"use client";

import { useRef } from "react";
import { ChevronDown, ChevronUp, Trash2, Upload } from "lucide-react";
import { IconButton, Button } from "@/src/studio/ui/Button";
import type { CourseChapter } from "./types";

export function ChapterDraft({
  chapter,
  index,
  total,
  onTitle,
  onMove,
  onRemove,
  onUpload,
  onAddLine,
  onVariationTitle,
  onVariationPgn,
  onMoveVariation,
  onRemoveVariation,
}: {
  chapter: CourseChapter;
  index: number;
  total: number;
  onTitle: (title: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onUpload: (file: File) => void;
  onAddLine: () => void;
  onVariationTitle: (variationId: string, title: string) => void;
  onVariationPgn: (variationId: string, pgn: string) => void;
  onMoveVariation: (index: number, direction: -1 | 1) => void;
  onRemoveVariation: (variationId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section className="rounded-xl border border-studio-border p-4">
      <div className="flex items-start gap-2">
        <label className="min-w-0 flex-1 text-caption text-studio-muted">
          Chapter {index + 1}
          <input
            value={chapter.title}
            onChange={(event) => onTitle(event.target.value)}
            placeholder="Chapter title"
            className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
          />
        </label>
        <div className="mt-5 flex shrink-0 gap-0.5">
          <IconButton label="Move chapter up" size="sm" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronUp size={14} />
          </IconButton>
          <IconButton label="Move chapter down" size="sm" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ChevronDown size={14} />
          </IconButton>
          <IconButton label="Remove chapter" size="sm" onClick={onRemove}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {chapter.variations.map((variation, variationIndex) => (
          <div key={variation.id} className="rounded-lg bg-studio-chrome p-3">
            <div className="flex items-center gap-2">
              <input
                value={variation.title}
                onChange={(event) => onVariationTitle(variation.id, event.target.value)}
                placeholder="Line name"
                className="min-w-0 flex-1 rounded-lg border border-studio-border bg-studio-bg px-3 py-2 text-body text-studio-fg"
              />
              <IconButton
                label="Move line up"
                size="sm"
                disabled={variationIndex === 0}
                onClick={() => onMoveVariation(variationIndex, -1)}
              >
                <ChevronUp size={14} />
              </IconButton>
              <IconButton
                label="Move line down"
                size="sm"
                disabled={variationIndex === chapter.variations.length - 1}
                onClick={() => onMoveVariation(variationIndex, 1)}
              >
                <ChevronDown size={14} />
              </IconButton>
              <IconButton label="Remove line" size="sm" onClick={() => onRemoveVariation(variation.id)}>
                <Trash2 size={14} />
              </IconButton>
            </div>
            <textarea
              value={variation.pgn}
              onChange={(event) => onVariationPgn(variation.id, event.target.value)}
              rows={5}
              placeholder="{Opening comment} 1. e4 e5 {Why this move.}"
              className="mt-2 w-full rounded-lg border border-studio-border bg-studio-bg px-3 py-2 font-mono text-dense text-studio-fg"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onAddLine}>
          Add line
        </Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          <Upload size={14} />
          Upload PGN
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
      <p className="mt-2 text-caption text-studio-faint">
        A commented PGN for this chapter. Each game in the file becomes a line.
      </p>
    </section>
  );
}
