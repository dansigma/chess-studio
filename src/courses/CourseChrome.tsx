"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteSections } from "@/src/site/sections";
import { BrandLockup } from "@/src/studio/ui/BrandLockup";
import { LocaleSwitcher } from "@/src/i18n/LocaleSwitcher";
import { tCourse } from "@/src/i18n/course-strings";
import { useStudioStore } from "@/src/store/studio-store";

export function CourseChrome({
  admin = false,
  isAdmin = false,
}: {
  admin?: boolean;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const locale = useStudioStore((state) => state.settings.locale);

  return (
    <header className="flex h-12 items-center gap-4 border-b border-studio-border bg-studio-chrome px-4">
      <Link href="/courses" className="shrink-0">
        <BrandLockup />
      </Link>
      <nav className="flex items-center gap-1 text-body">
        {siteSections(locale).map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-2 py-1 ${
                active
                  ? "bg-studio-hover text-studio-fg"
                  : "text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
              }`}
            >
              {section.label}
            </Link>
          );
        })}
        {isAdmin ? (
          <Link href="/admin/users" className="rounded-md px-2 py-1 text-studio-accent-text hover:bg-studio-hover">
            {tCourse(locale, "course.chrome.adminUsers")}
          </Link>
        ) : null}
        {admin ? (
          <Link href="/courses/admin" className="rounded-md px-2 py-1 text-studio-accent-text hover:bg-studio-hover">
            {tCourse(locale, "course.chrome.createCourse")}
          </Link>
        ) : null}
      </nav>
      <div className="ml-auto">
        <LocaleSwitcher />
      </div>
    </header>
  );
}
