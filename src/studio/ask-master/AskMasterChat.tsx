"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { getFenAt } from "@/src/chess/tree";
import { fenPly } from "@/src/lib/ask-master/answer-lines";
import { tAskMaster } from "@/src/i18n/ask-master-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import type { AskMasterIntent } from "@/src/lib/ask-master/intent";
import { AskMasterAnswer, answerWithGameTitles } from "./AskMasterAnswer";
import { AskMasterStarters } from "./AskMasterStarters";
import { AskMasterHistory, useHistoryDot } from "./AskMasterHistory";
import { currentHistoryKey } from "./history-keys";
import type { AskMasterStore } from "./ask-master-store";
import { ChatHeader } from "./ui/ChatHeader";
import { ChatComposer } from "./ui/ChatComposer";
import { MessageBubble } from "./ui/MessageBubble";
import { NoticeCard } from "./ui/NoticeCard";
import { TypingIndicator } from "./ui/TypingIndicator";

export function AskMasterChat({
  store,
  locale,
  signedIn,
  isMobile,
  titleId,
  onClose,
  expanded,
  onToggleExpanded,
}: {
  store: AskMasterStore;
  locale: SiteLocale;
  signedIn: boolean;
  isMobile: boolean;
  titleId: string;
  onClose: () => void;
  expanded: boolean;
  onToggleExpanded?: () => void;
}) {
  const { conversationId, messages, status, questionsLeft, refreshQuota, send, close, reset } = useStore(store);
  const { id, tree, path, title } = useActiveBoard();
  const [showHistory, setShowHistory] = useState(false);
  const positionKey = currentHistoryKey(tree, path);
  const needsSignIn = !signedIn || status === "signInPrompt";
  const { hasHistory, refresh } = useHistoryDot(needsSignIn ? null : positionKey, store);
  const historyButton = useRef<HTMLButtonElement>(null);
  const { sanLine, lineFens, fen } = useMemo(() => {
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
    return { sanLine, lineFens, fen: getFenAt(tree, path) };
  }, [tree, path]);
  const [question, setQuestion] = useState("");
  const transcript = useRef<HTMLDivElement>(null);
  const busy = status === "analyzing" || status === "answering" || status === "checking";

  useEffect(() => {
    if (signedIn) void refreshQuota();
    return close;
  }, [signedIn, refreshQuota, close]);

  useEffect(() => {
    const log = transcript.current;
    if (log) log.scrollTop = messages.length || questionsLeft === 0 ? log.scrollHeight : 0;
  }, [messages, status, showHistory, questionsLeft, expanded]);

  function ask(text: string, intent: AskMasterIntent) {
    if (!text.trim() || busy || questionsLeft === 0) return;
    const { engineBuild, engineThreads, askMasterLevel } = useStudioStore.getState().settings;
    void send(text, locale, { fen, sanLine, lineFens, engineBuild, engineThreads, level: askMasterLevel }, {
      boardId: id, path, currentFen: fen, lineFens, lineStartPly: fenPly(tree.startFen),
    }, { gameTitle: title.slice(0, 120), intent });
    setQuestion("");
  }

  return (
    <div className={`flex min-h-0 flex-col bg-studio-panel text-studio-fg ${
      isMobile
        ? "h-[min(36rem,calc(80dvh-1px))] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        : "flex-1 rounded-[inherit]"
    }`}>
      <ChatHeader locale={locale} titleId={titleId} questionsLeft={needsSignIn ? null : questionsLeft}
        historyButtonRef={historyButton}
        history={needsSignIn ? undefined : {
          open: showHistory, hasPosition: hasHistory,
          onToggle: () => setShowHistory(!showHistory),
        }}
        onNew={needsSignIn || showHistory ? undefined : () => { reset(); setQuestion(""); }}
        expanded={expanded} onToggleExpanded={onToggleExpanded} onClose={onClose} />
      {needsSignIn ? (
        <div role="log" className="min-h-0 flex-1 overflow-y-auto p-3">
          <NoticeCard role={status === "signInPrompt" ? "alert" : undefined} action={
            <a href="/login?next=%2Fstudio"
              className="inline-flex min-h-9 items-center rounded-full bg-studio-accent-solid px-3.5 font-medium text-studio-accent-fg hover:bg-studio-accent-hover">
              {tAskMaster(locale, "signIn")}
            </a>
          }>
            {tAskMaster(locale, "signInPrompt")}
          </NoticeCard>
        </div>
      ) : showHistory ? (
        <AskMasterHistory tree={tree} positionKey={positionKey} locale={locale} store={store}
          busyConversationId={busy ? conversationId : null}
          onOpen={() => { setQuestion(""); setShowHistory(false); historyButton.current?.focus(); }}
          onDelete={refresh} />
      ) : (
        <>
          <div ref={transcript} role="log"
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 text-body [overflow-wrap:anywhere]">
            {messages.length === 0 && (
              <>
                <MessageBubble role="assistant" locale={locale}>
                  <p>{tAskMaster(locale, "welcome")}</p>
                </MessageBubble>
                <AskMasterStarters fen={fen} lineFens={lineFens} locale={locale} disabled={busy || questionsLeft === 0} onAsk={ask} />
              </>
            )}
            {messages.map((message, index) => (
              <MessageBubble key={index} role={message.role} locale={locale} createdAt={message.createdAt}
                answer={message.role === "assistant" ? answerWithGameTitles(message.text, message.source) : undefined}>
                {message.role === "user" ? message.text : <AskMasterAnswer text={message.text} source={message.source} locale={locale} />}
              </MessageBubble>
            ))}
            {busy && messages.at(-1)?.role === "user" && <TypingIndicator locale={locale} status={status} />}
            {status !== "idle" && !busy && status !== "userLimit" && (
              <NoticeCard role="alert">{tAskMaster(locale, status)}</NoticeCard>
            )}
            {questionsLeft === 0 && (
              <NoticeCard role="status">{tAskMaster(locale, "userLimit")}</NoticeCard>
            )}
          </div>
          <ChatComposer locale={locale} question={question} disabled={busy || questionsLeft === 0}
            onChange={setQuestion} onSend={() => ask(question, "free")} />
        </>
      )}
    </div>
  );
}
