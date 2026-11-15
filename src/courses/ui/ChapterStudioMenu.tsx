"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { tCourse } from "@/src/i18n/course-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { MenuItem, MenuSurface } from "@/src/studio/ui/Menu";
import type { CourseVariation } from "../types";

/** SIG-1358: one "Abrir no Studio" menu per chapter; each item opens one line in Studio. */
export function ChapterStudioMenu({
  variations,
  locale,
  onOpen,
}: {
  variations: readonly CourseVariation[];
  locale: SiteLocale;
  onOpen: (variation: CourseVariation) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-dense text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
        onClick={() => setOpen((value) => !value)}
      >
        <ExternalLink size={14} aria-hidden />
        {tCourse(locale, "course.course.openInStudio")}
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1">
          <MenuSurface label={tCourse(locale, "course.course.openInStudio")} onClose={() => setOpen(false)}>
            {variations.map((variation) => (
              <MenuItem
                key={variation.id}
                label={variation.title}
                onClick={() => {
                  setOpen(false);
                  onOpen(variation);
                }}
              />
            ))}
          </MenuSurface>
        </div>
      ) : null}
    </div>
  );
}
