import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 200;
const VIEWPORT_MARGIN = 8;

export function HoverCard({ children, content, className, translate }: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  translate?: "yes" | "no";
}) {
  const id = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [phase, setPhase] = useState<"closed" | "pending" | "open">("closed");
  const active = phase !== "closed";
  const open = phase === "open";
  const close = () => {
    clearTimeout(closeTimer.current);
    setPhase("closed");
  };
  const requestOpen = () => {
    clearTimeout(closeTimer.current);
    setPhase((current) => current === "closed" ? "pending" : current);
  };
  const onPointerLeave = () => {
    clearTimeout(closeTimer.current);
    // Let the pointer cross the gap between the trigger and the portal.
    if (open) closeTimer.current = setTimeout(close, CLOSE_DELAY_MS);
    else close();
  };

  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setTimeout(() => setPhase("open"), OPEN_DELAY_MS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPhase("closed");
      }
    };
    // Hover can open the card when keyboard focus is elsewhere.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      clearTimeout(timer);
      clearTimeout(closeTimer.current);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [active]);

  useLayoutEffect(() => {
    const anchor = trigger.current;
    const panel = card.current;
    if (!open || !anchor || !panel) {
      return;
    }
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const { width, height } = panel.getBoundingClientRect();
      const { clientWidth, clientHeight } = document.documentElement;
      const below = rect.bottom + VIEWPORT_MARGIN;
      const above = rect.top - height - VIEWPORT_MARGIN;
      const top = below + height <= clientHeight - VIEWPORT_MARGIN ? below : above;
      panel.style.left = `${Math.max(VIEWPORT_MARGIN, Math.min(rect.left, clientWidth - width - VIEWPORT_MARGIN))}px`;
      panel.style.top = `${Math.max(VIEWPORT_MARGIN, Math.min(top, clientHeight - height - VIEWPORT_MARGIN))}px`;
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof window.Node && event.target.contains(anchor)) {
        setPhase("closed");
      }
    };
    position();
    // The card can change size once its data arrives.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(panel);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <>
      <span
        ref={trigger}
        className={className}
        translate={translate}
        tabIndex={0}
        title=""
        aria-describedby={open ? id : undefined}
        onFocus={requestOpen}
        onBlur={close}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") {
            requestOpen();
          }
        }}
        onPointerLeave={onPointerLeave}
      >
        {children}
      </span>
      {open ? createPortal(
        <div
          ref={card}
          id={id}
          role="tooltip"
          className="fixed z-[1050] w-max max-w-[min(18rem,calc(100vw-16px))] rounded-md border border-studio-border bg-studio-panel p-2.5 text-left text-dense font-normal text-studio-fg shadow-lg"
          onPointerEnter={() => clearTimeout(closeTimer.current)}
          onPointerLeave={onPointerLeave}
          onClick={(event) => event.stopPropagation()}
        >
          {content}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
