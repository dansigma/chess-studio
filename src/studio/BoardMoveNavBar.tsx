import { ArrowRightToLine, ChevronLeft, ChevronRight, ChevronsLeft } from "lucide-react";
import { continuationsAt, type GameTree, type Path } from "@/src/chess/tree";
import type { SiteLocale } from "@/src/i18n/locale";
import { tPanels } from "@/src/i18n/studio-panel-strings";
import { IconButton } from "./ui/Button";

export function BoardMoveNavBar({
  tree,
  path,
  locale,
  onStart,
  onBack,
  onForward,
  onEnd,
}: {
  tree: GameTree;
  path: Path;
  locale: SiteLocale;
  onStart: () => void;
  onBack: () => void;
  onForward: () => void;
  onEnd: () => void;
}) {
  const atStart = path.length === 0;
  const atEnd = continuationsAt(tree, path).length === 0;

  return (
    <div className="grid min-w-0 select-none grid-cols-4 items-center gap-0.5 rounded-lg border border-studio-border-subtle bg-studio-elevated px-1 [&>button]:max-w-full">
      <IconButton size="lg" label={tPanels(locale, "panels.board.moveNavStart")} shortcut="Home" disabled={atStart} onClick={onStart}>
        <ChevronsLeft size={18} />
      </IconButton>
      <IconButton size="lg" label={tPanels(locale, "panels.board.moveNavBack")} shortcut="←" disabled={atStart} onClick={onBack}>
        <ChevronLeft size={18} />
      </IconButton>
      <IconButton size="lg" label={tPanels(locale, "panels.board.moveNavForward")} shortcut="→" disabled={atEnd} onClick={onForward}>
        <ChevronRight size={18} />
      </IconButton>
      <IconButton size="lg" label={tPanels(locale, "panels.board.moveNavEnd")} shortcut="End" disabled={atEnd} onClick={onEnd}>
        <ArrowRightToLine size={18} />
      </IconButton>
    </div>
  );
}
