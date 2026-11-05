import type { CreditSegment } from "@/src/lib/legal/credits";

/** Renders credit text with its links; external links open in a new tab. */
export function CreditSegments({ segments, linkClassName }: { segments: CreditSegment[]; linkClassName?: string }) {
  return (
    <>
      {segments.map((segment, index) => {
        if (typeof segment === "string") {
          return <span key={index}>{segment}</span>;
        }
        const external = /^https?:/.test(segment.href);
        return (
          <a
            key={index}
            href={segment.href}
            className={linkClassName ?? "underline underline-offset-2 hover:text-studio-fg"}
            {...(external || segment.href.startsWith("/engine/") || segment.href.startsWith("/book/")
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {segment.text}
          </a>
        );
      })}
    </>
  );
}
