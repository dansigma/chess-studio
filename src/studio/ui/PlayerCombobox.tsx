"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FidePlayerSuggestion } from "@/src/lib/fide-players";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { useStudioStore } from "@/src/store/studio-store";

type Status = "idle" | "searching" | "done";

function subtitleFor(player: FidePlayerSuggestion): string | null {
  const parts: string[] = [];
  if (player.federation) {
    parts.push(player.federation);
  }
  if (player.title) {
    parts.push(player.title);
  }
  if (typeof player.rating === "number") {
    parts.push(String(player.rating));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function PlayerCombobox({
  id,
  value,
  onChange,
  onPick,
  placeholder,
  className = "",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onPick?: (suggestion: FidePlayerSuggestion) => void;
  placeholder?: string;
  className?: string;
}) {
  const query = value.trim();
  const searching = query.length >= 2;
  const locale = useStudioStore((state) => state.settings.locale);

  const [suggestions, setSuggestions] = useState<FidePlayerSuggestion[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [wasSearching, setWasSearching] = useState(searching);
  const baseId = useId();
  const inputId = id ?? `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const requestRef = useRef(0);
  const pickedRef = useRef<string | null>(null);

  // Render-phase reset (SIG-914): when the query drops below 2 chars,
  // clear suggestion state during render instead of inside the search
  // effect, keeping `react-hooks/set-state-in-effect` clean. This is
  // React's adjust-state-during-render pattern: it re-renders before
  // commit, so no stale-list frame is painted.
  if (wasSearching && !searching) {
    setSuggestions([]);
    setStatus("idle");
    setActiveIndex(-1);
    setOpen(false);
  }
  if (wasSearching !== searching) {
    setWasSearching(searching);
  }

  useEffect(() => {
    if (pickedRef.current !== null && query === pickedRef.current) {
      return;
    }
    if (!searching) {
      return;
    }
    const requestId = ++requestRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("searching");
      void fetch(`/api/players/fide?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("fide search failed");
          }
          return (await response.json()) as { players: FidePlayerSuggestion[] };
        })
        .then((payload) => {
          if (requestRef.current !== requestId || controller.signal.aborted) {
            return;
          }
          setSuggestions(payload.players);
          setActiveIndex(-1);
          setStatus("done");
          setOpen(true);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          if (requestRef.current !== requestId) {
            return;
          }
          setSuggestions([]);
          setActiveIndex(-1);
          setStatus("done");
          setOpen(true);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, searching]);

  function closeList() {
    // Invalidate any in-flight search so a late response can never
    // re-open a dismissed list (e.g. Escape while "Searching...").
    requestRef.current += 1;
    setStatus("idle");
    setOpen(false);
    setActiveIndex(-1);
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !listRef.current?.contains(target)) {
        closeList();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function pick(suggestion: FidePlayerSuggestion) {
    pickedRef.current = suggestion.name.trim();
    onChange(suggestion.name);
    onPick?.(suggestion);
    setSuggestions([]);
    setStatus("idle");
    setOpen(false);
    setActiveIndex(-1);
  }

  const showSearching = status === "searching";
  const showEmpty = status === "done" && suggestions.length === 0 && searching;
  const listOpen = open && (showSearching || showEmpty || suggestions.length > 0);

  useLayoutEffect(() => {
    if (!listOpen) {
      return;
    }
    function updatePosition() {
      const input = inputRef.current;
      const list = listRef.current;
      if (!input || !list) {
        return;
      }
      const rect = input.getBoundingClientRect();
      list.style.top = `${rect.bottom + 4}px`;
      list.style.left = `${rect.left}px`;
      list.style.width = `${rect.width}px`;
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [listOpen, status, suggestions.length]);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      {...(listOpen ? { "data-escape-defer": "true" } : {})}
    >
      <input
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 && activeIndex < suggestions.length
            ? `${baseId}-option-${activeIndex}`
            : undefined
        }
        value={value}
        onChange={(event) => {
          pickedRef.current = null;
          onChange(event.target.value);
        }}
        onBlur={(event) => {
          const related = event.relatedTarget as Node | null;
          if (!wrapperRef.current?.contains(related) && !listRef.current?.contains(related)) {
            closeList();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (listOpen) {
              event.stopPropagation();
              closeList();
            }
            return;
          }
          if (event.key === "ArrowDown") {
            if (suggestions.length === 0) {
              return;
            }
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => (current + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            if (suggestions.length === 0) {
              return;
            }
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) =>
              current <= 0 ? suggestions.length - 1 : current - 1,
            );
          } else if (event.key === "Enter") {
            if (listOpen && activeIndex >= 0 && activeIndex < suggestions.length) {
              event.preventDefault();
              pick(suggestions[activeIndex]);
            }
          } else if (event.key === "Tab") {
            closeList();
          }
        }}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
      />
      {listOpen && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              className="fixed z-[1200] max-h-56 overflow-auto rounded-md border border-studio-border-strong bg-studio-elevated py-1 shadow-xl"
            >
              {showSearching ? (
                <li role="status" className="px-2 py-1.5 text-body text-studio-faint">
                  {tStudioChrome(locale, "chrome.players.searching")}
                </li>
              ) : null}
              {!showSearching && showEmpty ? (
                <li role="status" className="px-2 py-1.5 text-body text-studio-faint">
                  {tStudioChrome(locale, "chrome.players.none")}
                </li>
              ) : null}
              {!showSearching
                ? suggestions.map((suggestion, index) => {
                    const subtitle = subtitleFor(suggestion);
                    return (
                      <li
                        key={suggestion.id}
                        id={`${baseId}-option-${index}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        tabIndex={-1}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          pick(suggestion);
                        }}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`cursor-pointer px-2 py-1.5 ${
                          index === activeIndex ? "bg-studio-selected" : ""
                        }`}
                      >
                        <span className="block text-body text-studio-fg">{suggestion.name}</span>
                        {subtitle ? (
                          <span className="block text-caption text-studio-faint">{subtitle}</span>
                        ) : null}
                      </li>
                    );
                  })
                : null}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
