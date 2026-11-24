"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useStore } from "zustand";
import { getFenAt } from "@/src/chess/tree";
import { fenPly } from "@/src/lib/ask-master/answer-lines";
import { tAskMaster } from "@/src/i18n/ask-master-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { ASK_MASTER_LEVELS, isAskMasterLevel } from "@/src/lib/ask-master/level";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "../ui/Button";
import { AskMasterAnswer } from "./AskMasterAnswer";
import { MAX_QUESTION_LENGTH, type AskMasterStore } from "./ask-master-store";

export function AskMasterChat({
  store,
  locale,
  signedIn,
  isMobile,
}: {
  store: AskMasterStore;
  locale: SiteLocale;
  signedIn: boolean;
  isMobile: boolean;
}) {
  const { messages, status, questionsLeft, refreshQuota, send, close, reset } = useStore(store);
  const { id, tree, path } = useActiveBoard();
  const level = useStudioStore((state) => state.settings.askMasterLevel);
  const setAskMasterLevel = useStudioStore((state) => state.setAskMasterLevel);
  const [question, setQuestion] = useState("");
  const questionId = useId();
  const disclaimerId = useId();
  const transcript = useRef<HTMLDivElement>(null);
  const busy = status === "analyzing" || status === "answering";

  useEffect(() => {
    if (signedIn) void refreshQuota();
    return close;
  }, [signedIn, refreshQuota, close]);

  useEffect(() => {
    const log = transcript.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, status]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || busy || questionsLeft === 0) return;

    const sanLine: string[] = [];
    const lineFens = [tree.startFen];
    let children = tree.children;
    for (const index of path) {
      const node = children[index];
      if (!node) break;
      sanLine.push(node.san);
      lineFens.push(node.fen);
      children = node.children;
    }
    const { engineBuild, engineThreads, askMasterLevel } = useStudioStore.getState().settings;
    const fen = getFenAt(tree, path);
    void send(question, locale, { fen, sanLine, lineFens, engineBuild, engineThreads, level: askMasterLevel }, {
      boardId: id, path, currentFen: fen, lineFens, lineStartPly: fenPly(tree.startFen),
    });
    setQuestion("");
  }

  if (!signedIn || status === "signInPrompt") {
    return (
      <div className="flex flex-col items-start gap-3 text-body">
        <p>{tAskMaster(locale, "signInPrompt")}</p>
        <a
          href="/login?next=%2Fstudio"
          className="inline-flex min-h-9 items-center rounded-lg bg-studio-accent-solid px-3.5 font-medium text-studio-accent-fg hover:bg-studio-accent-hover"
        >
          {tAskMaster(locale, "signIn")}
        </a>
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-col gap-3 ${isMobile ? "h-[min(29rem,calc(80dvh-6rem))]" : "flex-1"}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-caption text-studio-muted">
          {questionsLeft !== null
            ? tAskMaster(locale, questionsLeft === 1 ? "remainingOne" : "remaining", { count: questionsLeft })
            : null}
        </p>
        <select
          aria-label={tAskMaster(locale, "level")}
          className="min-h-8 rounded-lg border border-studio-border-strong bg-studio-bg px-2 text-dense text-studio-fg"
          value={level}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (isAskMasterLevel(value)) setAskMasterLevel(value);
          }}
        >
          {ASK_MASTER_LEVELS.map((value) => (
            <option key={value} value={value}>{tAskMaster(locale, value)}</option>
          ))}
        </select>
        <Button size="sm" variant="ghost" onClick={() => { reset(); setQuestion(""); }}>
          {tAskMaster(locale, "newQuestion")}
        </Button>
      </div>
      <div
        ref={transcript}
        role="log"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain [overflow-wrap:anywhere] text-body"
      >
        {messages.map((message, index) => (
          <div key={index} className={message.role === "user" ? "ml-6 whitespace-pre-wrap rounded-xl bg-studio-accent-soft p-2.5" : "mr-6 space-y-2 rounded-xl bg-studio-hover p-2.5"}>
            {message.role === "user" ? message.text : <AskMasterAnswer text={message.text} source={message.source} />}
          </div>
        ))}
        {busy && messages.at(-1)?.role === "user" ? (
          <p className="text-studio-muted">{tAskMaster(locale, status)}</p>
        ) : null}
      </div>
      {status !== "idle" && !busy && status !== "userLimit" ? (
        <p role="alert" className="shrink-0 text-dense text-studio-warning-fg">{tAskMaster(locale, status)}</p>
      ) : null}
      {questionsLeft === 0 ? (
        <p role="status" className="shrink-0 text-dense text-studio-warning-fg">{tAskMaster(locale, "userLimit")}</p>
      ) : null}
      <form className="shrink-0 space-y-2" onSubmit={submit}>
        <label className="sr-only" htmlFor={questionId}>{tAskMaster(locale, "question")}</label>
        <div className="flex items-end gap-2">
          <textarea
            id={questionId}
            aria-describedby={disclaimerId}
            className="min-w-0 flex-1 resize-none rounded-lg border border-studio-border-strong bg-studio-bg px-2.5 py-2 text-base text-studio-fg"
            placeholder={tAskMaster(locale, "question")}
            rows={2}
            maxLength={MAX_QUESTION_LENGTH}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!question.trim() || busy || questionsLeft === 0}>
            {tAskMaster(locale, "send")}
          </Button>
        </div>
        <p id={disclaimerId} className="text-caption text-studio-muted">{tAskMaster(locale, "disclaimer")}</p>
      </form>
    </div>
  );
}
