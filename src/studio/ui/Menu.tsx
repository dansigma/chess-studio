import type { ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";

export function MenuSurface({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="menu"
      className={`min-w-64 rounded-[9px] border border-studio-border-strong bg-studio-elevated p-1 shadow-2xl ${className}`}
    >
      {children}
    </div>
  );
}

export function MenuDivider() {
  return <div role="separator" className="mx-1.5 my-1 h-px bg-studio-border" />;
}

export function MenuItem({
  label,
  shortcut,
  checked,
  disabled,
  disabledReason,
  submenu,
  highlighted,
  danger,
  leading,
  onClick,
  onMouseEnter,
}: {
  label: ReactNode;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  submenu?: boolean;
  highlighted?: boolean;
  danger?: boolean;
  leading?: ReactNode;
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  const trailing = submenu ? (
    <ChevronRight size={14} className="text-studio-faint" />
  ) : disabled && disabledReason ? (
    <span className="text-caption italic">{disabledReason}</span>
  ) : shortcut ? (
    <span className="text-caption tabular-nums text-studio-faint">{shortcut}</span>
  ) : null;

  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      aria-haspopup={submenu || undefined}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`grid h-7 w-full grid-cols-[18px_1fr_auto] items-center gap-1.5 rounded-md pl-1.5 pr-2 text-left text-body disabled:cursor-default disabled:text-studio-disabled disabled:hover:bg-transparent ${
        danger ? "text-studio-danger" : "text-studio-fg"
      } ${highlighted ? "bg-studio-hover-strong" : "hover:bg-studio-hover-strong"}`}
    >
      <span className="flex items-center text-studio-accent-text">
        {checked ? <Check size={14} /> : null}
      </span>
      <span className="flex min-w-0 items-center gap-2 truncate">
        {leading}
        {label}
      </span>
      <span className="flex items-center pl-6">{trailing}</span>
    </button>
  );
}
