import type { ReactNode } from "react";

export function SidebarPanel({
  title,
  meta,
  actions,
  header,
  overlay,
  children,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  header?: ReactNode;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside className="relative flex h-full w-64 shrink-0 flex-col overflow-hidden rounded-[10px] bg-studio-panel">
      <div className="px-3 pb-2.5 pt-3">
        <div className="flex h-6 items-center justify-between gap-2">
          <h2 className="truncate text-body font-semibold text-studio-fg">{title}</h2>
          {actions ?? (meta !== undefined ? <span className="text-caption text-studio-faint">{meta}</span> : null)}
        </div>
        {header ? <div className="mt-2.5">{header}</div> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-2.5">{children}</div>
      {overlay}
    </aside>
  );
}

export function SidebarItem({
  selected,
  icon,
  title,
  description,
  trailing,
  onClick,
  onDoubleClick,
}: {
  selected?: boolean;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected || undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`relative mb-px flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left ${
        selected ? "bg-studio-accent-soft" : "hover:bg-studio-hover"
      }`}
    >
      {selected ? <span className="absolute inset-y-2 left-0 w-0.5 rounded bg-studio-accent" /> : null}
      {icon ? (
        <span className={`mt-px shrink-0 ${selected ? "text-studio-accent-text" : "text-studio-faint"}`}>
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-studio-fg">{title}</span>
        {description ? (
          <span className="block truncate text-caption text-studio-faint">{description}</span>
        ) : null}
      </span>
      {trailing !== undefined ? (
        <span className="mt-0.5 shrink-0 text-caption tabular-nums text-studio-faint">{trailing}</span>
      ) : null}
    </button>
  );
}

export function SidebarHint({ children }: { children: ReactNode }) {
  return <p className="px-2 py-3 text-dense leading-5 text-studio-faint">{children}</p>;
}
