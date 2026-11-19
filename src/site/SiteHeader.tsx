"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { siteSections } from "@/src/site/sections";
import { BrandLockup } from "@/src/studio/ui/BrandLockup";
import { AccountMenu } from "@/src/studio/AccountMenu";
import { SettingsDialog } from "@/src/studio/SettingsDialog";
import { tCourse } from "@/src/i18n/course-strings";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { toUserInfo } from "@/src/lib/auth/user-info";
import { canAuthorCourses, isAdmin as isAdminRole, type Role } from "@/src/lib/auth/roles";
import { loadRemoteSettingsForUser } from "@/src/lib/studio-persistence";
import { persistSettings, useStudioStore } from "@/src/store/studio-store";

const ADMIN_LINK =
  "shrink-0 rounded-md px-2 py-1 text-studio-accent-text hover:bg-studio-hover-strong transition-colors duration-150";

export function SiteHeader({
  admin: adminProp,
  isAdmin: isAdminProp,
  reviewCount: reviewCountProp,
}: {
  admin?: boolean;
  isAdmin?: boolean;
  /** Admin-only count badge. When omitted, admins fetch it client-side. */
  reviewCount?: number;
}) {
  const pathname = usePathname();
  const locale = useStudioStore((state) => state.settings.locale);
  const user = useStudioStore((state) => state.user);
  const setUser = useStudioStore((state) => state.setUser);
  const hydrateSettings = useStudioStore((state) => state.hydrateSettings);
  const settingsSignature = useStudioStore((state) => JSON.stringify(state.settings));
  const [reviewCount, setReviewCount] = useState(reviewCountProp ?? 0);
  const [resolvedRole, setResolvedRole] = useState<Role | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBaseline = useRef<string | null>(null);

  const effectiveAdmin = adminProp ?? canAuthorCourses(resolvedRole);
  const effectiveIsAdmin = isAdminProp ?? isAdminRole(resolvedRole);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    if (!supabase) {
      return;
    }
    let cancel = false;
    const syncSession = async (current: Parameters<typeof toUserInfo>[0] | null) => {
      if (cancel) {
        return;
      }
      setUser(current ? toUserInfo(current) : null);
      if (current && typeof supabase.from === "function") {
        const remote = await loadRemoteSettingsForUser(current.id).catch(() => null);
        if (!cancel && remote) {
          hydrateSettings(remote);
        }
      }
    };
    void supabase.auth.getUser().then(
      ({ data }) => syncSession(data.user ?? null),
      () => {},
    );
    const authSub = supabase.auth.onAuthStateChange?.((_event, session) => {
      void syncSession(session?.user ?? null);
    });
    return () => {
      cancel = true;
      authSub?.data?.subscription?.unsubscribe();
    };
  }, [hydrateSettings, setUser]);

  useEffect(() => {
    if (settingsBaseline.current === null) {
      settingsBaseline.current = settingsSignature;
      return;
    }
    if (settingsBaseline.current === settingsSignature) {
      return;
    }
    settingsBaseline.current = settingsSignature;
    const handle = window.setTimeout(() => {
      void persistSettings(useStudioStore.getState().settings).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [settingsSignature]);

  useEffect(() => {
    if (adminProp !== undefined && isAdminProp !== undefined) {
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        const { currentUserRole } = await import("@/src/courses/publish");
        const role = await currentUserRole();
        if (!cancel) {
          setResolvedRole(role);
        }
      } catch {
        if (!cancel) {
          setResolvedRole(null);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [adminProp, isAdminProp, user?.id]);

  useEffect(() => {
    if (reviewCountProp !== undefined || !effectiveIsAdmin) {
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        // Client-side fetch keeps the count out of every public page payload:
        // the action is admin-gated and returns forbidden for anyone else.
        const { reviewQueueCountAction } = await import("@/app/admin/courses/actions");
        const result = await reviewQueueCountAction();
        if (!cancel && result.ok) {
          setReviewCount(result.data.count);
        }
      } catch {
        // Fail closed: leave the badge hidden if the count request fails.
      }
    })();
    return () => {
      cancel = true;
    };
  }, [effectiveIsAdmin, reviewCountProp]);

  useEffect(() => {
    if (!accountOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.stopPropagation();
      setAccountOpen(false);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [accountOpen]);

  return (
    <header className="relative z-30 flex h-12 min-w-0 items-center gap-2 border-b border-studio-border bg-studio-chrome px-3 sm:gap-4 sm:px-4">
      {accountOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setAccountOpen(false)}
          aria-label={tStudioChrome(locale, "chrome.menu.closeMenu")}
        />
      ) : null}
      <Link
        href="/"
        className="relative z-20 -ml-1.5 shrink-0 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-studio-hover-strong hover:text-studio-fg"
      >
        <BrandLockup compact />
      </Link>
      <nav className="relative z-20 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-body [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {siteSections(locale).map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-md px-2 py-1 transition-colors duration-150 ${
                active
                  ? "bg-studio-accent-soft text-studio-fg"
                  : "text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
              }`}
            >
              {section.label}
            </Link>
          );
        })}
        {effectiveIsAdmin ? (
          <>
            <Link href="/admin/users" className={ADMIN_LINK}>
              {tCourse(locale, "course.chrome.adminUsers")}
            </Link>
            <Link href="/admin/courses" className={ADMIN_LINK}>
              {tCourse(locale, "course.chrome.reviewCourses")}
              {reviewCount > 0 ? (
                <span
                  className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-studio-accent-solid px-1 text-caption text-studio-accent-fg"
                  aria-label={tCourse(locale, "course.chrome.reviewCountAria", { count: reviewCount })}
                >
                  {reviewCount}
                </span>
              ) : null}
            </Link>
          </>
        ) : null}
        {effectiveAdmin ? (
          <Link href="/courses/admin" className={ADMIN_LINK}>
            {tCourse(locale, "course.chrome.createCourse")}
          </Link>
        ) : null}
      </nav>
      <div className="relative z-20 ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          aria-label={tCourse(locale, "course.chrome.settings")}
          title={tCourse(locale, "course.chrome.settings")}
          onClick={() => {
            setAccountOpen(false);
            setSettingsOpen(true);
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-studio-muted transition-colors duration-150 hover:bg-studio-hover-strong hover:text-studio-fg"
        >
          <Settings size={16} aria-hidden />
        </button>
        <AccountMenu
          open={accountOpen}
          onToggle={() => setAccountOpen((prev) => !prev)}
          onClose={() => setAccountOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>
      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </header>
  );
}
