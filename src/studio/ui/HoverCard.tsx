import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const OPEN_DELAY_MS = 300;
const VIEWPORT_MARGIN = 8;

export function HoverCard({ children, content, className }: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"closed" | "pending" | "open">("closed");
  const active = phase !== "closed";
  const open = phase === "open";
  const close = () => setPhase("closed");
  const requestOpen = () => setPhase((current) => current === "closed" ? "pending" : current);

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
        onPointerLeave={close}
      >
        {children}
      </span>
      {open ? createPortal(
        <div
          ref={card}
          id={id}
          role="tooltip"
          className="pointer-events-none fixed z-[1050] w-max max-w-[min(18rem,calc(100vw-16px))] rounded-md border border-studio-border bg-studio-panel p-2.5 text-left text-dense font-normal text-studio-fg shadow-lg"
        >
          {content}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
