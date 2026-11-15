"use client";

import type { KeyboardEvent, ReactNode } from "react";
import type { CourseAdminTab } from "./validate-draft";

export type AdminTabItem = { id: CourseAdminTab; label: string; hasError: boolean };

export function tabDomId(id: CourseAdminTab): string {
  return `course-tab-${id}`;
}

export function tabPanelDomId(id: CourseAdminTab): string {
  return `course-tabpanel-${id}`;
}

/**
 * SIG-1363: the course editor tab bar. Tab buttons are `type="button"` so
 * Enter in a field still submits (saves) the form. The panel is rendered by
 * the caller through `AdminTabPanel`.
 */
export function AdminTabs({
  tabs,
  active,
  onChange,
  label,
  errorLabel,
}: {
  tabs: AdminTabItem[];
  active: CourseAdminTab;
  onChange: (id: CourseAdminTab) => void;
  label: string;
  errorLabel: string;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (next) {
      onChange(next.id);
      document.getElementById(tabDomId(next.id))?.focus();
    }
  }
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 border-b border-studio-border pb-1">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={tabDomId(tab.id)}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={tabPanelDomId(tab.id)}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={`rounded px-2.5 py-1 text-dense ${active === tab.id ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
        >
          {tab.label}
          {tab.hasError ? (
            <span className="ml-1 font-semibold text-studio-warning-fg">
              <span aria-hidden>!</span>
              <span className="sr-only">{errorLabel}</span>
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function AdminTabPanel({ id, children }: { id: CourseAdminTab; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={tabPanelDomId(id)}
      aria-labelledby={tabDomId(id)}
      tabIndex={-1}
      className="space-y-4 pt-2 outline-none"
    >
      {children}
    </div>
  );
}
