"use client";

import { useState } from "react";
import {
  EXPLORER_SPEEDS,
  RATING_THRESHOLDS,
  toggleExplorerSpeed,
  type ExplorerFilters,
  type ExplorerSpeed,
} from "@/src/lib/explorer-filters";
import { fileDatabaseId, type ExplorerSource } from "@/src/lib/explorer-types";

const SPEED_LABELS: Record<ExplorerSpeed, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
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
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-caption ${
        active ? "bg-studio-selected text-studio-fg" : "text-studio-faint hover:bg-studio-hover-subtle"
      }`}
    >
      {label}
    </button>
  );
}

export function ExplorerFiltersBar({
  source,
  filters,
  onChange,
}: {
  source: ExplorerSource;
  filters: ExplorerFilters;
  onChange: (patch: Partial<ExplorerFilters>) => void;
}) {
  const personal = fileDatabaseId(source) != null;
  const showSpeed = source === "lichess" || source === "chesscom";
  const showRating = showSpeed || personal;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-studio-border-subtle px-3 py-2">
      {showSpeed
        ? EXPLORER_SPEEDS.map((speed) => (
            <Chip
              key={speed}
              label={SPEED_LABELS[speed]}
              active={filters.speeds.includes(speed)}
              onClick={() => onChange(toggleExplorerSpeed(filters, speed))}
            />
          ))
        : null}
      {showRating
        ? RATING_THRESHOLDS.map((rating) => (
            <Chip
              key={rating}
              label={rating === 0 ? "All" : `${rating}+`}
              active={filters.minRating === rating}
              onClick={() => onChange({ minRating: rating })}
            />
          ))
        : null}
      <YearField label="From" value={filters.sinceYear} onCommit={(sinceYear) => onChange({ sinceYear })} />
      <YearField label="To" value={filters.untilYear} onCommit={(untilYear) => onChange({ untilYear })} />
    </div>
  );
}

function YearField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number | null;
  onCommit: (year: number | null) => void;
}) {
  const [text, setText] = useState(value?.toString() ?? "");
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    setText(value?.toString() ?? "");
  }
  return (
    <label className="ml-1 flex items-center gap-1 text-caption text-studio-faint">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={1400}
        max={2100}
        placeholder="Year"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const next = yearValue(text);
          onCommit(next);
          setText(next?.toString() ?? "");
        }}
        className="w-16 rounded border border-studio-border bg-studio-selected px-1 py-0.5 text-studio-fg outline-none"
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
