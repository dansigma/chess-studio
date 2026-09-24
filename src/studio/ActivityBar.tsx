"use client";

import {
  Bookmark,
  Database,
  Folder,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import { useStudioStore, type ActivityView } from "@/src/store/studio-store";
import { Tooltip } from "./ui/Controls";

const items: { id: ActivityView; icon: typeof Search; title: string }[] = [
  { id: "search", icon: Search, title: "Search" },
  { id: "boards", icon: LayoutGrid, title: "Open boards" },
  { id: "databases", icon: Database, title: "Databases" },
  { id: "files", icon: Folder, title: "Files" },
  { id: "bookmarks", icon: Bookmark, title: "Bookmarks" },
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
            label={item.title}
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
          label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </ActivityButton>
      </div>
    </nav>
  );
}
