"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Chessboard } from "react-chessboard";
import { X } from "lucide-react";
import { tLibrary, type LibraryStringKey } from "@/src/i18n/library-strings";
import type { LibraryFilterState } from "@/src/lib/library/types";
import { useStudioStore } from "@/src/store/studio-store";
import { Tooltip } from "../ui/Controls";
import { useDialogFocus } from "../ui/use-dialog-focus";
import { getFieldSupport, type AdvancedFilterField, type SupportSource } from "./filter-support";
import { useLibraryStore } from "./library-store";

export const LIBRARY_FILTERS_DEBOUNCE_MS = 300;

export type LibraryFiltersPopoverProps = {
  /** Sources currently selected, with their capabilities. */
  selectedSources: SupportSource[];
  /** The Filters button: clicks on it are not "outside" and focus returns to it. */
  triggerRef: RefObject<HTMLElement | null>;
};

/** SIG-1280: advanced filters popover anchored to the Filters button. */
export function LibraryFiltersPopover({ selectedSources, triggerRef }: LibraryFiltersPopoverProps) {
  const locale = useStudioStore((state) => state.settings.locale);
  const t = (key: LibraryStringKey, vars?: Record<string, string | number>) => tLibrary(locale, key, vars);
  const filters = useLibraryStore((s) => s.filters);
  const setFilter = useLibraryStore((s) => s.setFilter);
  const setFiltersOpen = useLibraryStore((s) => s.setFiltersOpen);
  const rootRef = useRef<HTMLDivElement>(null);

  useDialogFocus(rootRef);
  // Declared after useDialogFocus so its cleanup runs last: the Filters button wins focus on close.
  useEffect(
    () => () => {
      triggerRef.current?.focus();
    },
    [triggerRef],
  );

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setFiltersOpen(false);
      }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [setFiltersOpen, triggerRef]);

  const support = (field: AdvancedFilterField) => getFieldSupport(field, selectedSources);
  const clearAdvanced = () => {
    setFilter("opponent", "");
    setFilter("color", "both");
    setFilter("result", "all");
    setFilter("annotations", "all");
    setFilter("position", null);
  };
  const soon = t("library.filtersPopover.positionSoon");

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={t("library.filtersPopover.title")}
      data-testid="library-filters-popover"
      className="absolute right-0 top-8 z-30 flex w-80 max-w-[calc(100vw-1rem)] flex-col gap-3 rounded-[9px] border border-studio-border-strong bg-studio-elevated p-3 shadow-2xl"
    >
      <Field label={t("library.filtersPopover.position")} support={support("position")}>
        {() => (
          <div className="flex flex-col gap-2">
            {filters.position ? (
              <div className="flex items-start gap-2">
                <div className="aspect-square w-24" data-testid="library-filters-position-preview">
                  <Chessboard
                    options={{
                      id: "library-filters-position",
                      position: filters.position.fen,
                      allowDragging: false,
                      allowDrawingArrows: false,
                      showAnimations: false,
                      showNotation: false,
                      boardStyle: { width: "100%", height: "100%", borderRadius: 6, overflow: "hidden" },
                    }}
                  />
                </div>
                <button
                  type="button"
                  aria-label={t("library.filtersPopover.positionClear")}
                  onClick={() => setFilter("position", null)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <span className="text-caption text-studio-faint">{t("library.filtersPopover.positionNone")}</span>
            )}
            <Tooltip label={soon} side="bottom">
              <button
                type="button"
                disabled
                title={soon}
                className="h-7 rounded-md border border-studio-border px-2 text-dense text-studio-disabled"
              >
                {t("library.filtersPopover.positionSet")}
              </button>
            </Tooltip>
          </div>
        )}
      </Field>

      <Field label={t("library.filtersPopover.opponent")} support={support("opponent")}>
        {(disabled, describedBy) => (
          <DebouncedText
            value={filters.opponent}
            disabled={disabled}
            describedBy={describedBy}
            placeholder={t("library.filtersPopover.opponentPlaceholder")}
            onCommit={(value) => setFilter("opponent", value)}
          />
        )}
      </Field>

      <Field label={t("library.filtersPopover.color")} support={support("color")}>
        {(disabled, describedBy, labelId) => (
          <Segmented<LibraryFilterState["color"]>
            labelId={labelId}
            describedBy={describedBy}
            disabled={disabled}
            value={filters.color}
            onChange={(value) => setFilter("color", value)}
            options={[
              { value: "both", label: t("library.filtersPopover.colorBoth") },
              { value: "white", label: t("library.filtersPopover.colorWhite") },
              { value: "black", label: t("library.filtersPopover.colorBlack") },
            ]}
          />
        )}
      </Field>

      <Field label={t("library.filtersPopover.result")} support={support("result")}>
        {(disabled, describedBy, labelId) => (
          <Segmented<LibraryFilterState["result"]>
            labelId={labelId}
            describedBy={describedBy}
            disabled={disabled}
            value={filters.result}
            onChange={(value) => setFilter("result", value)}
            options={[
              { value: "all", label: t("library.filtersPopover.resultAll") },
              { value: "1-0", label: "1-0" },
              { value: "0-1", label: "0-1" },
              { value: "draw", label: t("library.filtersPopover.resultDraw") },
            ]}
          />
        )}
      </Field>

      <Field label={t("library.filtersPopover.annotations")} support={support("annotations")}>
        {(disabled, describedBy, labelId) => (
          <select
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            disabled={disabled}
            value={filters.annotations}
            onChange={(event) => setFilter("annotations", event.target.value as LibraryFilterState["annotations"])}
            className="h-7 w-full rounded-md border border-studio-border bg-studio-bg px-2 text-dense text-studio-fg disabled:text-studio-disabled"
          >
            <option value="all">{t("library.filtersPopover.annotationsAll")}</option>
            <option value="annotated">{t("library.filtersPopover.annotationsAnnotated")}</option>
            <option value="commented">{t("library.filtersPopover.annotationsCommented")}</option>
          </select>
        )}
      </Field>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={clearAdvanced}
          className="h-7 rounded-md px-2 text-dense text-studio-accent-text hover:bg-studio-hover-strong"
        >
          {t("library.filtersPopover.clear")}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  support,
  children,
}: {
  label: string;
  support: ReturnType<typeof getFieldSupport>;
  children: (disabled: boolean, describedBy: string | undefined, labelId: string) => ReactNode;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const id = useId();
  const labelId = `${id}-label`;
  const noteId = `${id}-note`;
  const notes: string[] = [];
  if (support.partial.length > 0) {
    notes.push(tLibrary(locale, "library.filtersPopover.notePartial", { sources: support.partial.join(", ") }));
  }
  if (support.none.length > 0 && !support.disabled) {
    notes.push(tLibrary(locale, "library.filtersPopover.noteNone", { sources: support.none.join(", ") }));
  }
  const unsupported = tLibrary(locale, "library.filtersPopover.unsupported");
  const body = children(support.disabled, notes.length > 0 ? noteId : undefined, labelId);
  return (
    <div className="flex flex-col gap-1" data-field-disabled={support.disabled || undefined}>
      <span id={labelId} className="text-caption font-medium text-studio-muted">
        {label}
      </span>
      {support.disabled ? (
        <Tooltip label={unsupported} side="bottom">
          <span className="flex w-full" title={unsupported}>
            {body}
          </span>
        </Tooltip>
      ) : (
        body
      )}
      {notes.length > 0 ? (
        <span id={noteId} className="text-caption text-studio-faint">
          {notes.join(" · ")}
        </span>
      ) : null}
    </div>
  );
}

/** Text input with local state; commits 300 ms after the last keystroke, follows external changes. */
function DebouncedText({
  value,
  disabled,
  describedBy,
  placeholder,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  describedBy?: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Text typed but not committed yet, and the latest onCommit, for the unmount flush.
  const pending = useRef<string | null>(null);
  const commit = useRef(onCommit);
  useEffect(() => {
    commit.current = onCommit;
  }, [onCommit]);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  // External change (e.g. "Clear filters"): drop any pending commit of stale text.
  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      pending.current = null;
    }
  }, [value]);
  // Closing the popover within the debounce window must not lose what was typed.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (pending.current !== null) {
        commit.current(pending.current);
        pending.current = null;
      }
    },
    [],
  );
  return (
    <input
      type="text"
      value={text}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-label={placeholder}
      placeholder={placeholder}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        if (timer.current) {
          clearTimeout(timer.current);
        }
        pending.current = next;
        timer.current = setTimeout(() => {
          timer.current = null;
          pending.current = null;
          onCommit(next);
        }, LIBRARY_FILTERS_DEBOUNCE_MS);
      }}
      className="h-7 w-full rounded-md border border-studio-border bg-studio-bg px-2 text-dense text-studio-fg placeholder:text-studio-faint disabled:text-studio-disabled"
    />
  );
}

/** Radio-group segmented control: roving tabindex, arrow keys move and select. */
function Segmented<T extends string>({
  labelId,
  describedBy,
  disabled,
  value,
  options,
  onChange,
}: {
  labelId: string;
  describedBy?: string;
  disabled: boolean;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex w-full gap-0.5 rounded-md bg-studio-bg p-0.5"
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`h-6 flex-1 rounded px-1.5 text-dense disabled:text-studio-disabled ${
              selected ? "bg-studio-accent-soft text-studio-accent-text" : "text-studio-muted hover:bg-studio-hover-strong"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
