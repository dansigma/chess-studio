"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Chessboard } from "react-chessboard";
import { X } from "lucide-react";
import { tLibrary, type LibraryStringKey } from "@/src/i18n/library-strings";
import { suggestLibraryPlayers } from "@/src/lib/library/file-source";
import type { LibraryFilterState } from "@/src/lib/library/types";
import { useStudioStore } from "@/src/store/studio-store";
import { Tooltip } from "../ui/Controls";
import { useDialogFocus } from "../ui/use-dialog-focus";
import { getFieldSupport, type AdvancedFilterField, type SupportSource } from "./filter-support";
import { useLibraryStore } from "./library-store";
import { PositionFilterDialog } from "./PositionFilterDialog";

export const LIBRARY_FILTERS_DEBOUNCE_MS = 300;
/** SIG-1326: player, ECO and number fields filter a whole database, so they commit a little sooner. */
export const LIBRARY_FILTERS_FIELD_DEBOUNCE_MS = 200;

const digitsOnly = (text: string) => text.replace(/\D/g, "").slice(0, 4);
const toNumber = (text: string) => (text === "" ? null : Number(text));

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
  const setEloRange = useLibraryStore((s) => s.setEloRange);
  const setYearRange = useLibraryStore((s) => s.setYearRange);
  const rootRef = useRef<HTMLDivElement>(null);
  const [positionOpen, setPositionOpen] = useState(false);
  // The position dialog is portaled out of the popover: while it is open, its clicks and Escape are not "outside".
  const positionOpenRef = useRef(false);
  useEffect(() => {
    positionOpenRef.current = positionOpen;
  }, [positionOpen]);

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
      if (event.key === "Escape" && !positionOpenRef.current) {
        event.stopPropagation();
        setFiltersOpen(false);
      }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (positionOpenRef.current || !target || rootRef.current?.contains(target) || triggerRef.current?.contains(target)) {
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
    setFilter("player", "");
    setFilter("playerColor", "both");
    setFilter("eloMin", null);
    setFilter("eloMax", null);
    setFilter("eco", "");
    setFilter("yearFrom", null);
    setFilter("yearTo", null);
  };

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
            <button
              type="button"
              onClick={() => setPositionOpen(true)}
              className="h-7 rounded-md border border-studio-border px-2 text-dense text-studio-fg hover:bg-studio-hover-strong"
            >
              {t("library.filtersPopover.positionSet")}
            </button>
          </div>
        )}
      </Field>

      <Field label={t("library.filtersPopover.player")} support={support("player")}>
        {(disabled, describedBy) => (
          <div className="flex flex-col gap-1.5">
            <DebouncedText
              value={filters.player}
              disabled={disabled}
              describedBy={describedBy}
              placeholder={t("library.filtersPopover.playerPlaceholder")}
              delay={LIBRARY_FILTERS_FIELD_DEBOUNCE_MS}
              suggest={(text) => suggestLibraryPlayers(filters.sources, text)}
              suggestionsLabel={t("library.filtersPopover.playerSuggestions")}
              onCommit={(value) => setFilter("player", value)}
            />
            <Segmented<LibraryFilterState["playerColor"]>
              ariaLabel={t("library.filtersPopover.playerColor")}
              describedBy={describedBy}
              disabled={disabled}
              value={filters.playerColor}
              onChange={(value) => setFilter("playerColor", value)}
              options={[
                { value: "both", label: t("library.filtersPopover.playerAnyColor") },
                { value: "white", label: t("library.filtersPopover.colorWhite") },
                { value: "black", label: t("library.filtersPopover.colorBlack") },
              ]}
            />
          </div>
        )}
      </Field>

      <Field label={t("library.filtersPopover.elo")} support={support("elo")}>
        {(disabled, describedBy) => (
          <div className="flex gap-2">
            <DebouncedText
              value={filters.eloMin === null ? "" : String(filters.eloMin)}
              disabled={disabled}
              describedBy={describedBy}
              placeholder={t("library.filtersPopover.eloMin")}
              delay={LIBRARY_FILTERS_FIELD_DEBOUNCE_MS}
              sanitize={digitsOnly}
              inputMode="numeric"
              onCommit={(value) => setEloRange(toNumber(value), useLibraryStore.getState().filters.eloMax)}
            />
            <DebouncedText
              value={filters.eloMax === null ? "" : String(filters.eloMax)}
              disabled={disabled}
              describedBy={describedBy}
              placeholder={t("library.filtersPopover.eloMax")}
              delay={LIBRARY_FILTERS_FIELD_DEBOUNCE_MS}
              sanitize={digitsOnly}
              inputMode="numeric"
              onCommit={(value) => setEloRange(useLibraryStore.getState().filters.eloMin, toNumber(value))}
            />
          </div>
        )}
      </Field>

      <Field label={t("library.filtersPopover.eco")} support={support("eco")}>
        {(disabled, describedBy) => (
          <DebouncedText
            value={filters.eco}
            disabled={disabled}
            describedBy={describedBy}
            placeholder={t("library.filtersPopover.ecoPlaceholder")}
            ariaLabel={t("library.filtersPopover.eco")}
            delay={LIBRARY_FILTERS_FIELD_DEBOUNCE_MS}
            sanitize={(text) => text.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3)}
            onCommit={(value) => setFilter("eco", value)}
          />
        )}
      </Field>

      <Field label={t("library.filtersPopover.period")} support={support("period")}>
        {(disabled, describedBy) => (
          <div className="flex gap-2">
            <DebouncedText
              value={filters.yearFrom === null ? "" : String(filters.yearFrom)}
              disabled={disabled}
              describedBy={describedBy}
              placeholder={t("library.filtersPopover.yearFrom")}
              delay={LIBRARY_FILTERS_FIELD_DEBOUNCE_MS}
              sanitize={digitsOnly}
              inputMode="numeric"
              onCommit={(value) => setYearRange(toNumber(value), useLibraryStore.getState().filters.yearTo)}
            />
            <DebouncedText
              value={filters.yearTo === null ? "" : String(filters.yearTo)}
              disabled={disabled}
              describedBy={describedBy}
              placeholder={t("library.filtersPopover.yearTo")}
              delay={LIBRARY_FILTERS_FIELD_DEBOUNCE_MS}
              sanitize={digitsOnly}
              inputMode="numeric"
              onCommit={(value) => setYearRange(useLibraryStore.getState().filters.yearFrom, toNumber(value))}
            />
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
      {positionOpen ? createPortal(<PositionFilterDialog onClose={() => setPositionOpen(false)} />, document.body) : null}
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
  ariaLabel,
  delay = LIBRARY_FILTERS_DEBOUNCE_MS,
  sanitize,
  inputMode,
  suggest,
  suggestionsLabel,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  describedBy?: string;
  placeholder: string;
  ariaLabel?: string;
  delay?: number;
  /** Applied to what is typed (e.g. digits only). */
  sanitize?: (text: string) => string;
  inputMode?: "numeric";
  /** Turns the input into a combobox listing these suggestions for the typed text. */
  suggest?: (text: string) => string[];
  suggestionsLabel?: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
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
  const suggestions = useMemo(() => (suggest && open ? suggest(text) : []), [suggest, open, text]);
  const showList = open && suggestions.length > 0;
  const schedule = (next: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    pending.current = next;
    timer.current = setTimeout(() => {
      timer.current = null;
      pending.current = null;
      onCommit(next);
    }, delay);
  };
  const pick = (name: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = null;
    setText(name);
    setOpen(false);
    setActive(-1);
    onCommit(name);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!suggest) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) {
        return;
      }
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && showList && active >= 0) {
      event.preventDefault();
      pick(suggestions[active]);
    } else if (event.key === "Escape" && showList) {
      // Closes the list only; a second Escape closes the popover.
      event.preventDefault();
      event.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      setActive(-1);
    }
  };
  return (
    <div className="relative w-full">
      <input
        type="text"
        inputMode={inputMode}
        value={text}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        {...(suggest
          ? {
              role: "combobox" as const,
              "aria-autocomplete": "list" as const,
              "aria-expanded": showList,
              "aria-controls": listId,
              "aria-activedescendant": showList && active >= 0 ? `${listId}-${active}` : undefined,
              autoComplete: "off",
            }
          : {})}
        onChange={(event) => {
          const next = sanitize ? sanitize(event.target.value) : event.target.value;
          setText(next);
          setOpen(true);
          setActive(-1);
          schedule(next);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        className="h-7 w-full rounded-md border border-studio-border bg-studio-bg px-2 text-dense text-studio-fg placeholder:text-studio-faint disabled:text-studio-disabled"
      />
      {suggest ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={suggestionsLabel}
          hidden={!showList}
          className="absolute left-0 right-0 top-8 z-40 max-h-48 overflow-auto rounded-md border border-studio-border-strong bg-studio-elevated py-1 shadow-xl"
        >
          {suggestions.map((name, index) => (
            <li
              key={name}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown (not click) so the input's blur does not close the list first.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(name);
              }}
              className={`cursor-pointer truncate px-2 py-1 text-dense ${
                index === active ? "bg-studio-accent-soft text-studio-accent-text" : "text-studio-fg hover:bg-studio-hover-strong"
              }`}
            >
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Radio-group segmented control: roving tabindex, arrow keys move and select. */
function Segmented<T extends string>({
  labelId,
  ariaLabel,
  describedBy,
  disabled,
  value,
  options,
  onChange,
}: {
  labelId?: string;
  ariaLabel?: string;
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
      aria-label={ariaLabel}
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
