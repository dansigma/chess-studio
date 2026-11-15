"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FlipVertical2,
  Keyboard,
} from "lucide-react";
import { tCourse } from "@/src/i18n/course-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { IconButton } from "@/src/studio/ui/Button";

export function StudyTransport({
  locale,
  atStart,
  canForward,
  canEnd,
  onStart,
  onBack,
  onForward,
  onEnd,
  onFlip,
  onHelp,
}: {
  locale: SiteLocale;
  atStart: boolean;
  canForward: boolean;
  canEnd: boolean;
  onStart: () => void;
  onBack: () => void;
  onForward: () => void;
  onEnd: () => void;
  onFlip: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton
        label={tCourse(locale, "course.lesson.transport.start")}
        shortcut="Home"
        disabled={atStart}
        onClick={onStart}
      >
        <ChevronsLeft size={15} />
      </IconButton>
      <IconButton
        label={tCourse(locale, "course.lesson.transport.back")}
        shortcut="←"
        disabled={atStart}
        onClick={onBack}
      >
        <ChevronLeft size={15} />
      </IconButton>
      <IconButton
        label={tCourse(locale, "course.lesson.transport.forward")}
        shortcut="→"
        disabled={!canForward}
        onClick={onForward}
      >
        <ChevronRight size={15} />
      </IconButton>
      <IconButton
        label={tCourse(locale, "course.lesson.transport.end")}
        shortcut="End"
        disabled={!canEnd}
        onClick={onEnd}
      >
        <ChevronsRight size={15} />
      </IconButton>
      <IconButton
        className="ml-1"
        label={tCourse(locale, "course.lesson.flip")}
        shortcut="F"
        onClick={onFlip}
      >
        <FlipVertical2 size={15} />
      </IconButton>
      <IconButton label={tCourse(locale, "course.lesson.shortcuts.open")} shortcut="?" onClick={onHelp}>
        <Keyboard size={15} />
      </IconButton>
    </div>
  );
}
