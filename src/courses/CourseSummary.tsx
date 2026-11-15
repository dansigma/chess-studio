"use client";

import { useMemo } from "react";
import { splitDescriptionBlocks } from "./description";
import { StudyBoard } from "./ui/StudyBoard";

/**
 * Renders the course description: sanitized html runs as markup, and each chess
 * diagram as a static board with its caption, in reading order.
 */
export function CourseSummary({ html, className }: { html: string; className?: string }) {
  // Rendered HTML is parser-sanitized at render (and already at publish), so no raw markup reaches the DOM.
  const blocks = useMemo(() => splitDescriptionBlocks(html), [html]);
  if (blocks.length === 0) {
    return null;
  }
  return (
    <div className={className}>
      {blocks.map((block, index) =>
        block.type === "html" ? (
          <div key={index} dangerouslySetInnerHTML={{ __html: block.html }} />
        ) : (
          <figure key={index} className="w-full max-w-sm">
            <div className="aspect-square w-full" role="img" aria-label={block.caption || block.fen}>
              <StudyBoard id={`course-description-diagram-${index}`} fen={block.fen} orientation={block.orientation} />
            </div>
            {block.caption ? (
              <figcaption className="mt-1.5 text-caption text-studio-muted">{block.caption}</figcaption>
            ) : null}
          </figure>
        ),
      )}
    </div>
  );
}
