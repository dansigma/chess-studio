"use client";

import { mergeAttributes, Node, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { StudyBoard } from "./ui/StudyBoard";
import type { DiagramOrientation } from "./description";

export type ChessDiagramAttrs = { fen: string; orientation: DiagramOrientation; caption: string };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    chessDiagram: {
      insertChessDiagram: (attrs: ChessDiagramAttrs) => ReturnType;
    };
  }
}

function DiagramView({ node, selected }: NodeViewProps) {
  const { fen, orientation, caption } = node.attrs as ChessDiagramAttrs;
  return (
    <NodeViewWrapper
      as="figure"
      data-drag-handle
      className={`my-2 w-56 max-w-full rounded-lg ${selected ? "ring-2 ring-studio-accent" : ""}`}
      contentEditable={false}
    >
      <div className="aspect-square w-full">
        <StudyBoard id={`description-diagram-${fen}`} fen={fen} orientation={orientation} />
      </div>
      {caption ? <figcaption className="mt-1 text-caption text-studio-muted">{caption}</figcaption> : null}
    </NodeViewWrapper>
  );
}

/**
 * SIG-1368: a chess diagram is an atom block that serializes to
 * `<figure data-fen data-orientation data-caption>`, the exact shape the
 * sanitizer keeps (and validates) and the course page renders as a board.
 */
export const ChessDiagram = Node.create({
  name: "chessDiagram",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      fen: { default: "", parseHTML: (element) => element.getAttribute("data-fen") ?? "" },
      orientation: {
        default: "white",
        parseHTML: (element) => (element.getAttribute("data-orientation") === "black" ? "black" : "white"),
      },
      caption: { default: "", parseHTML: (element) => element.getAttribute("data-caption") ?? "" },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-fen]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { fen, orientation, caption } = node.attrs as ChessDiagramAttrs;
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-fen": fen,
        "data-orientation": orientation,
        ...(caption ? { "data-caption": caption } : {}),
      }),
    ];
  },

  addCommands() {
    return {
      insertChessDiagram:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramView);
  },
});
