"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { tAskMaster } from "@/src/i18n/ask-master-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import type { GameTree } from "@/src/chess/tree";
import type { getConversation, summarizeConversation } from "@/src/lib/ask-master/conversations";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import type { AskMasterStore } from "./ask-master-store";
import { gameHistoryKeys } from "./history-keys";

type Summary = ReturnType<typeof summarizeConversation>;
type Conversation = NonNullable<Awaited<ReturnType<typeof getConversation>>>;
type Tab = "game" | "position";
const endpoint = "/api/ask-master/conversations";

async function listHistory(body: string, signal: AbortSignal): Promise<Summary[]> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal,
  });
  if (!response.ok) throw new Error("History request failed");
  const { conversations } = await response.json();
  return conversations;
}

export function useHistoryDot(positionKey: string | null, store: AskMasterStore) {
  const [result, setResult] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => store.subscribe((state, previous) => {
    if (previous.status === "answering" && state.status === "idle" &&
        state.messages === previous.messages && state.messages.at(-1)?.role === "assistant") {
      setRevision((value) => value + 1);
    }
  }), [store]);

  useEffect(() => {
    if (!positionKey) return;
    const request = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const rows = await listHistory(JSON.stringify({ positionKeys: [positionKey] }), request.signal);
        if (!request.signal.aborted) setResult(rows.length > 0 ? positionKey : null);
      } catch {
        if (!request.signal.aborted) setResult(null);
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      request.abort();
    };
  }, [positionKey, revision]);

  return {
    hasHistory: positionKey !== null && result === positionKey,
    refresh: () => setRevision((value) => value + 1),
  };
}

type HistoryProps = {
  tree: GameTree;
  positionKey: string;
  locale: SiteLocale;
  store: AskMasterStore;
  busyConversationId: string | null;
  onOpen: () => void;
  onDelete: () => void;
};

export function AskMasterHistory({ tree, positionKey, ...props }: HistoryProps) {
  const [tab, setTab] = useState<Tab>("game");
  const id = useId();
  const tabs = useRef<HTMLDivElement>(null);
  const body = useMemo(() => JSON.stringify({
    positionKeys: tab === "game" ? gameHistoryKeys(tree) : [positionKey],
  }), [tab, tree, positionKey]);

  return (
    <>
      <div className="flex shrink-0 gap-2" ref={tabs} role="tablist" aria-label={tAskMaster(props.locale, "history")}>
        {(["game", "position"] as const).map((value) => (
          <Button
            key={value}
            id={id + value}
            role="tab"
            aria-selected={tab === value}
            aria-controls={id + "panel"}
            tabIndex={tab === value ? 0 : -1}
            variant={tab === value ? "secondary" : "ghost"}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" || (event.key !== "End" && value === "position") ? "game" : "position";
              setTab(next);
              tabs.current?.querySelector<HTMLElement>(next === "game" ? ":first-child" : ":last-child")?.focus();
            }}
          >
            {tAskMaster(props.locale, value === "game" ? "historyGame" : "historyPosition")}
          </Button>
        ))}
      </div>
      <div id={id + "panel"} role="tabpanel" aria-labelledby={id + tab} tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-wrap:anywhere]">
        <HistoryResults key={tab + body} body={body} {...props} />
      </div>
    </>
  );
}

function HistoryResults({ body, locale, store, busyConversationId, onOpen, onDelete }:
  Omit<HistoryProps, "tree" | "positionKey"> & { body: string }) {
  const [rows, setRows] = useState<Summary[] | null>(null);
  const [error, setError] = useState<"historyError" | "historyOpenError" | "historyDeleteError" | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<Summary | null>(null);
  const opening = useRef<AbortController | null>(null);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  useEffect(() => {
    const request = new AbortController();
    void listHistory(body, request.signal).then(
      (conversations) => { if (!request.signal.aborted) setRows(conversations); },
      () => { if (!request.signal.aborted) setError("historyError"); },
    );
    return () => {
      request.abort();
      opening.current?.abort();
    };
  }, [body]);

  async function openConversation(id: string) {
    const request = new AbortController();
    opening.current = request;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, { signal: request.signal });
      if (!response.ok) throw new Error("Open failed");
      const conversation: Conversation = await response.json();
      if (request.signal.aborted) return;
      store.getState().loadConversation(conversation.id, conversation.messages);
      onOpen();
    } catch {
      if (!request.signal.aborted) setError("historyOpenError");
    } finally {
      if (!request.signal.aborted) setPending(false);
    }
  }

  async function deleteConversation(id: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error("Delete failed");
      const chat = store.getState();
      if (chat.conversationId === id) chat.reset();
      setRows((current) => current?.filter((row) => row.id !== id) ?? null);
      onDelete();
    } catch {
      setError("historyDeleteError");
    } finally {
      setPending(false);
      setConfirm(null);
    }
  }

  return (
    <>
      {error && <p role="alert" className="pb-2 text-body text-studio-warning-fg">{tAskMaster(locale, error)}</p>}
      {!rows && !error && <p role="status" className="text-body text-studio-muted">{tAskMaster(locale, "historyLoading")}</p>}
      {rows?.length === 0 && <p className="text-body text-studio-muted">{tAskMaster(locale, "historyEmpty")}</p>}
      <ul className="space-y-2">
        {rows?.map((row) => (
          <li key={row.id} className="space-y-1 rounded-lg border border-studio-border p-2.5 text-body">
            <div className="flex flex-wrap justify-between gap-x-2 text-caption text-studio-muted">
              <span>{row.gameTitle || tAskMaster(locale, "historyUntitled")}</span>
              <time dateTime={row.updatedAt}>{date.format(new Date(row.updatedAt))}</time>
            </div>
            <p className="font-medium">{row.firstQuestion}</p>
            <p className="text-caption text-studio-muted">
              {tAskMaster(locale, "historyMessages", { count: row.messageCount })} · {row.model}
            </p>
            <div className="flex justify-end gap-1">
              <Button size="sm" disabled={pending} onClick={() => void openConversation(row.id)}>{tAskMaster(locale, "historyOpen")}</Button>
              <Button size="sm" variant="ghost" disabled={pending || row.id === busyConversationId}
                onClick={() => setConfirm(row)}>{tAskMaster(locale, "historyDelete")}</Button>
            </div>
          </li>
        ))}
      </ul>
      {confirm && (
        <Dialog title={tAskMaster(locale, "historyConfirm")} onClose={() => { if (!pending) setConfirm(null); }} footer={
          <>
            <Button disabled={pending} onClick={() => setConfirm(null)}>{tAskMaster(locale, "historyCancel")}</Button>
            <Button variant="danger" disabled={pending} onClick={() => void deleteConversation(confirm.id)}>
              {tAskMaster(locale, "historyDelete")}
            </Button>
          </>
        }>
          <p>{confirm.firstQuestion}</p>
        </Dialog>
      )}
    </>
  );
}
