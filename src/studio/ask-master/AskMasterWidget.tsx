"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { tAskMaster } from "@/src/i18n/ask-master-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { BottomSheet } from "../BottomSheet";
import { Button, IconButton } from "../ui/Button";
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

  const chat = open ? <AskMasterChat store={store} locale={locale} signedIn={signedIn} isMobile={isMobile} /> : null;

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
        onClick={() => open ? close() : setOpen(true)}
      >
        <MessageCircle size={21} aria-hidden="true" />
      </Button>
      {chat && (isMobile ? (
        <BottomSheet title={title} onClose={close}>{chat}</BottomSheet>
      ) : (
        <div
          ref={panel}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="fixed bottom-20 right-4 z-[1040] flex h-[560px] max-h-[calc(100dvh-6rem)] w-[380px] flex-col gap-3 rounded-xl border border-studio-border-strong bg-studio-panel p-4 shadow-2xl outline-none"
        >
          <div className="flex shrink-0 items-center justify-between gap-3">
            <h2 id={titleId} className="text-title font-semibold">{title}</h2>
            <IconButton label={tAskMaster(locale, "close")} shortcut="Esc" onClick={close}>
              <X size={16} aria-hidden="true" />
            </IconButton>
          </div>
          {chat}
        </div>
      ))}
    </div>
  );
}
