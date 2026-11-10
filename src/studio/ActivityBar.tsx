"use client";

import {
  Bookmark,
  Database,
  Folder,
  GraduationCap,
  History,
  LayoutDashboard,
  Library,
  Puzzle,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SITE_NAME, siteSections } from "@/src/site/sections";
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
  { id: "mygames", icon: History, titleKey: "chrome.activity.mygames" },
];

// SIG-1201: site navigation icons, mapped by href so labels/hrefs come from
// siteSections(locale).
const SITE_ICONS: Record<string, typeof Search> = {
  "/studio": LayoutDashboard,
  "/courses": GraduationCap,
  "/puzzles": Puzzle,
};
const SITE_ORDER = ["/studio", "/courses", "/puzzles"];

function isActivePath(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

// Active link = accent-tinted square, no left bar, so it never reads like the
// "sidebar view open" state (left accent bar + neutral hover fill).
function ActivityLink({
  href,
  label,
  active,
  onClick,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
        className="flex h-10 w-12 items-center justify-center"
      >
        <span
          className={`flex h-[34px] w-[34px] items-center justify-center rounded-lg transition-colors ${
            active
              ? "bg-studio-accent-soft text-studio-accent-text"
              : "text-studio-faint hover:bg-studio-hover hover:text-studio-fg"
          }`}
        >
          {children}
        </span>
      </Link>
    </Tooltip>
  );
}

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
  const workspaceView = useStudioStore((state) => state.workspaceView);
  const setWorkspaceView = useStudioStore((state) => state.setWorkspaceView);
  const toggleLibrary = useStudioStore((state) => state.toggleLibrary);
  const toggleSidebar = useStudioStore((state) => state.toggleSidebar);
  const pathname = usePathname();
  const sections = siteSections(locale)
    .filter((section) => SITE_ICONS[section.href])
    .sort((a, b) => SITE_ORDER.indexOf(a.href) - SITE_ORDER.indexOf(b.href));

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-0.5 bg-studio-bg py-2">
      <div role="group" aria-label={SITE_NAME} className="flex flex-col items-center gap-0.5">
        {sections.map((section) => {
          const Icon = SITE_ICONS[section.href];
          return (
            <ActivityLink
              key={section.href}
              href={section.href}
              label={section.label}
              active={isActivePath(pathname, section.href) && !(section.href === "/studio" && workspaceView === "library")}
              onClick={section.href === "/studio" ? () => setWorkspaceView("studio") : undefined}
            >
              <Icon size={18} />
            </ActivityLink>
          );
        })}
      </div>
      <div aria-hidden="true" className="mx-3 my-1 h-px w-6 bg-studio-border" />
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
      <ActivityButton
        label={tStudioChrome(locale, "chrome.activity.library")}
        active={workspaceView === "library"}
        onClick={toggleLibrary}
      >
        <Library size={18} />
      </ActivityButton>
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
