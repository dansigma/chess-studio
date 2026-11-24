"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { tAskMaster } from "@/src/i18n/ask-master-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../ui/Button";
import { AskMasterChat } from "./AskMasterChat";
import { createAskMasterStore } from "./ask-master-store";

export function AskMasterWidget({ visible, isMobile }: { visible: boolean; isMobile: boolean }) {
  const userId = useStudioStore((state) => state.user?.id);
  return <Widget key={userId} visible={visible} isMobile={isMobile} signedIn={Boolean(userId)} />;
}

function Widget({ visible, isMobile, signedIn }: { visible: boolean; isMobile: boolean; signedIn: boolean }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [store] = useState(createAskMasterStore);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const title = tAskMaster(locale, "title");
  if (!visible && open) setOpen(false);

  const close = useCallback(() => {
    store.getState().close();
    setOpen(false);
    launcher.current?.focus();
  }, [store]);

  useEffect(() => {
    if (!visible || !open || isMobile) return;
    panel.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" &&
          !document.querySelector('[aria-modal="true"], [data-escape-defer]')) {
        event.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [visible, open, isMobile, close]);

  if (!visible) return null;

  const chat = open ? (
    <AskMasterChat store={store} locale={locale} signedIn={signedIn} isMobile={isMobile}
      titleId={titleId} onClose={close} expanded={expanded}
      onToggleExpanded={isMobile ? undefined : () => setExpanded((value) => !value)} />
  ) : null;

  return (
    // Floating in the bottom-right corner, outside the layout flow. On mobile it
    // sits above the status bar and the tab bar.
    <div
      className={`fixed z-[1040] ${isMobile
        ? "bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))]"
        : "bottom-4 right-4"}`}
    >
      <Button
        ref={launcher}
        variant="primary"
        aria-label={title}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="!size-12 !rounded-full !p-0 shadow-2xl"
        onClick={(event) => {
          if (open) {
            close();
          } else {
            event.currentTarget.focus({ preventScroll: true });
            setOpen(true);
          }
        }}
      >
        <MessageCircle size={21} aria-hidden="true" />
      </Button>
      {chat && (isMobile ? (
        <BottomSheet labelledBy={titleId} onClose={close}>{chat}</BottomSheet>
      ) : (
        <div
          ref={panel}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`fixed bottom-20 right-4 z-[1040] flex max-h-[calc(100dvh-6rem)] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-studio-border-strong bg-studio-panel shadow-2xl outline-none ${
            expanded ? "h-[720px] w-[560px]" : "h-[560px] w-[380px]"
          }`}
        >
          {chat}
        </div>
      ))}
    </div>
  );
}
