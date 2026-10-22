"use client";

import {
  Bookmark,
  Database,
  Folder,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import { useStudioStore, type ActivityView } from "@/src/store/studio-store";
import { tStudioChrome, type StudioChromeStringKey } from "@/src/i18n/studio-chrome-strings";
import { Tooltip } from "./ui/Controls";
import { ChessboardIcon } from "./ui/ChessboardIcon";

const items: { id: ActivityView; icon: typeof Search; titleKey: StudioChromeStringKey }[] = [
  { id: "search", icon: Search, titleKey: "chrome.activity.search" },
  { id: "boards", icon: ChessboardIcon, titleKey: "chrome.activity.boards" },
  { id: "databases", icon: Database, titleKey: "chrome.activity.databases" },
  { id: "files", icon: Folder, titleKey: "chrome.activity.files" },
  { id: "bookmarks", icon: Bookmark, titleKey: "chrome.activity.bookmarks" },
];

function ActivityButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={`group relative flex h-10 w-12 items-center justify-center ${
          active ? "text-studio-fg" : "text-studio-faint hover:text-studio-fg"
        }`}
      >
        {active ? (
          <span className="absolute inset-y-2.5 left-0 w-0.5 rounded-r bg-studio-accent" />
        ) : null}
        <span
          className={`flex h-[34px] w-[34px] items-center justify-center rounded-lg ${
            active ? "bg-studio-hover" : "group-hover:bg-studio-hover"
          }`}
        >
          {children}
        </span>
      </button>
    </Tooltip>
  );
}

export function ActivityBar() {
  const locale = useStudioStore((state) => state.settings.locale);
  const activity = useStudioStore((state) => state.activity);
  const sidebarCollapsed = useStudioStore((state) => state.settings.sidebarCollapsed);
  const setActivity = useStudioStore((state) => state.setActivity);
  const toggleSidebar = useStudioStore((state) => state.toggleSidebar);

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-0.5 bg-studio-bg py-2">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activity && !sidebarCollapsed;
        return (
          <ActivityButton
            key={item.id}
            label={tStudioChrome(locale, item.titleKey)}
            active={active}
            onClick={() => {
              if (active) {
                toggleSidebar();
                return;
              }
              setActivity(item.id);
            }}
          >
            <Icon size={18} />
          </ActivityButton>
        );
      })}
      <div className="mt-auto">
        <ActivityButton
          label={tStudioChrome(locale, sidebarCollapsed ? "chrome.activity.expand" : "chrome.activity.collapse")}
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </ActivityButton>
      </div>
    </nav>
  );
}
