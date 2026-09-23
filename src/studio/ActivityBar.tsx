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
import { useStudioStore, type ActivityView } from "@/src/store/studio-store";

const items: { id: ActivityView; icon: typeof Search; title: string }[] = [
  { id: "search", icon: Search, title: "Search" },
  { id: "boards", icon: LayoutGrid, title: "Open Boards" },
  { id: "databases", icon: Database, title: "Databases" },
  { id: "files", icon: Folder, title: "Files" },
  { id: "bookmarks", icon: Bookmark, title: "Bookmarks" },
];

function SidebarTip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 text-[12px] font-medium text-zinc-900 shadow-lg group-hover:block">
      {label}
    </span>
  );
}

export function ActivityBar() {
  const activity = useStudioStore((state) => state.activity);
  const sidebarCollapsed = useStudioStore((state) => state.settings.sidebarCollapsed);
  const setActivity = useStudioStore((state) => state.setActivity);
  const toggleSidebar = useStudioStore((state) => state.toggleSidebar);

  return (
    <div className="flex w-12 flex-col items-center gap-1 bg-studio-bg py-2 pb-12">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activity && !sidebarCollapsed;
        return (
          <button
            key={item.id}
            type="button"
            title={item.title}
            className={`group relative flex h-10 w-10 items-center justify-center rounded ${
              active ? "text-studio-fg" : "text-studio-faint hover:text-studio-fg"
            } ${active ? "border-l-2 border-sky-400 bg-studio-hover-subtle" : "border-l-2 border-transparent"}`}
            onClick={() => {
              if (item.id === activity && !sidebarCollapsed) {
                toggleSidebar();
                return;
              }
              setActivity(item.id);
            }}
          >
            <Icon size={18} />
          </button>
        );
      })}
      <button
        type="button"
        className="group relative mt-auto mb-1 flex h-10 w-10 items-center justify-center rounded text-studio-faint hover:bg-studio-hover-subtle hover:text-studio-fg"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        <SidebarTip label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} />
      </button>
    </div>
  );
}
