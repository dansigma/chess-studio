import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { tAskMaster } from "@/src/i18n/ask-master-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { ASK_MASTER_LEVELS } from "@/src/lib/ask-master/level";
import { useStudioStore } from "@/src/store/studio-store";
import { MenuItem, MenuSurface } from "../../ui/Menu";

export function LevelChip({ locale }: { locale: SiteLocale }) {
  const level = useStudioStore((state) => state.settings.askMasterLevel);
  const setLevel = useStudioStore((state) => state.setAskMasterLevel);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = tAskMaster(locale, "level");

  function close() {
    trigger.current?.focus();
    setOpen(false);
  }

  return (
    <div className="relative shrink-0" data-escape-defer={open ? "" : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}>
      <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} title={label}
        className="flex min-h-9 items-center gap-1 rounded-full border border-studio-border-strong bg-studio-elevated px-2 text-caption font-medium text-studio-fg hover:bg-studio-hover"
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Escape" && open) {
            event.stopPropagation();
            close();
          }
        }}>
        {tAskMaster(locale, "levelChip", { level: tAskMaster(locale, level) })}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <MenuSurface label={label} onClose={close} className="absolute bottom-full left-0 z-10 mb-2 !min-w-40">
          {ASK_MASTER_LEVELS.map((option) => (
            <MenuItem key={option} radio checked={level === option} label={tAskMaster(locale, option)}
              onClick={() => {
                setLevel(option);
                close();
              }} />
          ))}
        </MenuSurface>
      )}
    </div>
  );
}
