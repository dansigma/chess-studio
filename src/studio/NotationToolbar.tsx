"use client";

import {
  ArrowRightToLine,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  MessageSquare,
  RefreshCw,
  Scissors,
  Trash2,
} from "lucide-react";
import { canMakeMainline, canPromote, type Path } from "@/src/chess/tree";
import { IconButton } from "./ui/Button";

export function NotationToolbar({
  path,
  commentOpen,
  onStart,
  onBack,
  onForward,
  onSkipForward,
  onEnd,
  onFlip,
  onToggleComment,
  onPromote,
  onMakeMainline,
  onDeleteAfter,
  onDeleteVariation,
}: {
  path: Path;
  commentOpen: boolean;
  onStart: () => void;
  onBack: () => void;
  onForward: () => void;
  onSkipForward: () => void;
  onEnd: () => void;
  onFlip: () => void;
  onToggleComment: () => void;
  onPromote: () => void;
  onMakeMainline: () => void;
  onDeleteAfter: () => void;
  onDeleteVariation: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 border-b border-studio-border-subtle px-1.5 py-1">
      <IconButton label="Start" shortcut="Home" onClick={onStart}>
        <ChevronsLeft size={15} />
      </IconButton>
      <IconButton label="Back" shortcut="←" onClick={onBack}>
        <ChevronLeft size={15} />
      </IconButton>
      <IconButton label="Forward" shortcut="→" onClick={onForward}>
        <ChevronRight size={15} />
      </IconButton>
      <IconButton label="Skip forward" onClick={onSkipForward}>
        <ChevronsRight size={15} />
      </IconButton>
      <IconButton label="End" shortcut="End" onClick={onEnd}>
        <ArrowRightToLine size={15} />
      </IconButton>
      <IconButton label="Flip board" shortcut="Ctrl+F" onClick={onFlip}>
        <RefreshCw size={14} />
      </IconButton>
      <div className="mx-1 h-4 w-px bg-studio-border-strong" />
      <IconButton label="Edit annotations" shortcut="Ctrl+A" active={commentOpen} onClick={onToggleComment}>
        <MessageSquare size={14} />
      </IconButton>
      <IconButton
        label="Promote variation"
        shortcut="Ctrl+↑"
        disabled={!canPromote(path)}
        onClick={onPromote}
      >
        <ArrowUp size={14} />
      </IconButton>
      <IconButton
        label="Make mainline"
        shortcut="Ctrl+Shift+↑"
        disabled={!canMakeMainline(path)}
        onClick={onMakeMainline}
      >
        <ChevronsUp size={14} />
      </IconButton>
      <IconButton label="Delete after" shortcut="Del" onClick={onDeleteAfter}>
        <Scissors size={14} />
      </IconButton>
      <IconButton
        label="Delete variation"
        shortcut="Ctrl+Del"
        disabled={path.length === 0}
        onClick={onDeleteVariation}
      >
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}
