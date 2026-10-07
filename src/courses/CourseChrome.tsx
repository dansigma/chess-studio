"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_SECTIONS } from "@/src/site/sections";
import { BrandLockup } from "@/src/studio/ui/BrandLockup";

export function CourseChrome({
  admin = false,
}: {
  admin?: boolean;
}) {
  const pathname = usePathname();

  return (
    <header className="flex h-12 items-center gap-4 border-b border-studio-border bg-studio-chrome px-4">
      <Link href="/courses" className="shrink-0">
        <BrandLockup />
      </Link>
      <nav className="flex items-center gap-1 text-body">
        {SITE_SECTIONS.map((section) => {
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
        {admin ? (
          <Link href="/courses/admin" className="rounded-md px-2 py-1 text-studio-accent-text hover:bg-studio-hover">
            Create course
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
