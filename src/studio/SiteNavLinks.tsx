"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_NAME } from "@/src/site/sections";
import { isActivePath, SITE_NAV_ICONS, siteNavSections } from "@/src/site/nav";
import { useStudioStore } from "@/src/store/studio-store";

// SIG-1202: the same site navigation as the desktop activity bar (SIG-1201),
// rendered as touch-sized links at the top of the mobile hamburger sheet.
// The /studio item mirrors desktop: it is only current while the studio
// workspace is showing (not Library/Live), and tapping it returns to the
// studio view — on mobile that view lives inside /studio behind
// workspaceView, so the link needs the same setWorkspaceView("studio") call.
export function SiteNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const workspaceView = useStudioStore((state) => state.workspaceView);
  const setWorkspaceView = useStudioStore((state) => state.setWorkspaceView);
  const pathname = usePathname();

  return (
    <nav aria-label={SITE_NAME} className="flex flex-col px-1.5 pb-1">
      {siteNavSections(locale).map((section) => {
        const Icon = SITE_NAV_ICONS[section.href];
        const active =
          isActivePath(pathname, section.href) &&
          !(section.href === "/studio" && workspaceView !== "studio");
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (section.href === "/studio") {
                setWorkspaceView("studio");
              }
              onNavigate?.();
            }}
            className={`flex min-h-[44px] items-center gap-3 rounded-md px-2 text-sm ${
              active
                ? "bg-studio-accent-soft text-studio-fg"
                : "text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
            }`}
          >
            <Icon size={18} />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
