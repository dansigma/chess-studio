"use client";

import { useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  EXPLORER_SPEEDS,
  RATING_THRESHOLDS,
  activeExplorerFilterCount,
  toggleExplorerSpeed,
  type ExplorerFilters,
  type ExplorerSpeed,
} from "@/src/lib/explorer-filters";
import { fileDatabaseId, type ExplorerSource } from "@/src/lib/explorer-types";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { useStudioStore } from "@/src/store/studio-store";

const SPEED_LABEL_KEYS: Record<ExplorerSpeed, Parameters<typeof tPanels>[1]> = {
  bullet: "explorer.filter.bullet",
  blitz: "explorer.filter.blitz",
  rapid: "explorer.filter.rapid",
  classical: "explorer.filter.classical",
};

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-caption ${
        active ? "bg-studio-selected text-studio-fg" : "text-studio-faint hover:bg-studio-hover"
      }`}
    >
      {label}
    </button>
  );
}

function sourceFilters(source: ExplorerSource): { speed: boolean; rating: boolean } {
  const personal = fileDatabaseId(source) != null;
  const speed = source === "lichess" || source === "chesscom";
  return { speed, rating: speed || personal };
}

/**
 * SIG-1194: the explorer filters collapse into one "Filters · N" button whose
 * popover holds speed, rating and year range. The count keeps an active
 * filter visible while the popover is closed; it only counts filters the
 * current source offers.
 */
export function ExplorerFiltersBar({
  source,
  filters,
  onChange,
}: {
  source: ExplorerSource;
  filters: ExplorerFilters;
  onChange: (patch: Partial<ExplorerFilters>) => void;
}) {
  const locale: SiteLocale = useStudioStore((state) => state.settings.locale);
  const [open, setOpen] = useState(false);
  const available = sourceFilters(source);
  const count = activeExplorerFilterCount(filters, available);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const summary = yearRangeSummary(filters.sinceYear, filters.untilYear);
  const label =
    count > 0 ? tPanels(locale, "explorer.filters.active", { count }) : tPanels(locale, "explorer.filters.label");

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-caption ${
          count > 0
            ? "bg-studio-accent-soft text-studio-accent-text hover:bg-studio-accent-soft"
            : "text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
        } ${open ? "ring-1 ring-studio-border-strong" : ""}`}
      >
        <SlidersHorizontal size={12} aria-hidden="true" />
        {label}
        {summary ? <span className="tabular-nums opacity-80">· {summary}</span> : null}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label={tPanels(locale, "explorer.filters.close")}
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label={tPanels(locale, "explorer.filters.label")}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                buttonRef.current?.focus();
              }
            }}
            className="absolute right-0 top-7 z-20 flex w-64 flex-col gap-2.5 rounded-[9px] border border-studio-border-strong bg-studio-elevated p-2.5 shadow-2xl"
          >
            {available.speed ? (
              <FilterGroup title={tPanels(locale, "explorer.filters.speed")}>
                {EXPLORER_SPEEDS.map((speed) => (
                  <Chip
                    key={speed}
                    label={tPanels(locale, SPEED_LABEL_KEYS[speed])}
                    active={filters.speeds.includes(speed)}
                    onClick={() => onChange(toggleExplorerSpeed(filters, speed))}
                  />
                ))}
              </FilterGroup>
            ) : null}
            {available.rating ? (
              <FilterGroup title={tPanels(locale, "explorer.filters.rating")}>
                {RATING_THRESHOLDS.map((rating) => (
                  <Chip
                    key={rating}
                    label={rating === 0 ? tPanels(locale, "explorer.filter.all") : `${rating}+`}
                    active={filters.minRating === rating}
                    onClick={() => onChange({ minRating: rating })}
                  />
                ))}
              </FilterGroup>
            ) : null}
            <FilterGroup title={tPanels(locale, "explorer.filters.period")}>
              <YearField
                label={tPanels(locale, "explorer.filter.from")}
                placeholder={tPanels(locale, "explorer.filter.year")}
                value={filters.sinceYear}
                onCommit={(sinceYear) => onChange({ sinceYear })}
              />
              <span className="text-caption text-studio-faint" aria-hidden="true">–</span>
              <YearField
                label={tPanels(locale, "explorer.filter.to")}
                placeholder={tPanels(locale, "explorer.filter.year")}
                value={filters.untilYear}
                onCommit={(untilYear) => onChange({ untilYear })}
              />
            </FilterGroup>
          </div>
        </>
      ) : null}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-studio-faint">{title}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

/** Year range summary for the closed button ("1950–2026", "2010–…"). */
export function yearRangeSummary(sinceYear: number | null, untilYear: number | null): string | null {
  if (sinceYear == null && untilYear == null) {
    return null;
  }
  return `${sinceYear ?? "…"}–${untilYear ?? "…"}`;
}

function YearField({
  label,
  placeholder,
  value,
  onCommit,
}: {
  label: string;
  placeholder: string;
  value: number | null;
  onCommit: (year: number | null) => void;
}) {
  const [text, setText] = useState(value?.toString() ?? "");
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    setText(value?.toString() ?? "");
  }
  const commit = () => {
    const next = yearValue(text);
    onCommit(next);
    setText(next?.toString() ?? "");
  };
  return (
    <label className="flex items-center gap-1 text-caption text-studio-faint">
      <span className="sr-only">{label}</span>
      {/* SIG-1194: a text input with a numeric keyboard — no number spinners. */}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        aria-label={label}
        placeholder={`${label} ${placeholder.toLowerCase()}`}
        value={text}
        onChange={(event) => setText(event.target.value.replace(/\D/gu, ""))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          }
        }}
        className="w-[5.5rem] rounded border border-studio-border bg-studio-selected px-1.5 py-0.5 tabular-nums text-studio-fg outline-none placeholder:text-studio-faint focus:border-studio-accent"
      />
    </label>
  );
}

function yearValue(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1400 || year > 2100) {
    return null;
  }
  return year;
}
