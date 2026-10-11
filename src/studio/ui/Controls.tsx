import type { ReactNode } from "react";
import { Minus, Plus, Search, X } from "lucide-react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-studio-border-strong px-1 py-0.5 font-sans text-[10px] font-medium leading-none text-studio-faint">
      {children}
    </kbd>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "accent";
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-[18px] shrink-0 items-center rounded-[5px] px-1.5 text-caption font-semibold ${
        tone === "accent"
          ? "bg-studio-accent-soft text-studio-accent-text"
          : "bg-studio-hover-strong text-studio-muted"
      }`}
    >
      {children}
    </span>
  );
}

export function Chip({
  active,
  icon,
  onClick,
  children,
}: {
  active?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-caption ${
        active
          ? "border-transparent bg-studio-accent-soft text-studio-accent-text"
          : "border-studio-border bg-studio-hover-subtle text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export function Stepper({
  label,
  value,
  canDecrement,
  canIncrement,
  onDecrement,
  onIncrement,
}: {
  label: string;
  value: ReactNode;
  canDecrement: boolean;
  canIncrement: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const buttonClass =
    "flex h-full w-6 items-center justify-center text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="inline-flex h-6 items-center overflow-hidden rounded-md border border-studio-border-strong text-dense">
      <button
        type="button"
        className={buttonClass}
        disabled={!canDecrement}
        onClick={onDecrement}
        aria-label={`Decrease ${label.toLowerCase()}`}
      >
        <Minus size={12} />
      </button>
      <span className="flex h-full items-center gap-1.5 border-x border-studio-border px-2 tabular-nums text-studio-fg">
        <span className="text-caption text-studio-faint">{label}</span>
        {value}
      </span>
      <button
        type="button"
        className={buttonClass}
        disabled={!canIncrement}
        onClick={onIncrement}
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  className = "",
  id,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  autoFocus?: boolean;
}) {
  return (
    <label
      className={`flex h-[30px] items-center gap-1.5 rounded-md border border-transparent bg-studio-selected px-2 text-studio-faint focus-within:border-studio-accent ${className}`}
    >
      <Search size={14} className="shrink-0" />
      <input
        id={id}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-dense text-studio-fg outline-none placeholder:text-studio-faint"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-studio-hover-strong text-studio-muted hover:text-studio-fg"
        >
          <X size={10} />
        </button>
      ) : null}
    </label>
  );
}

export function SectionHeader({
  trailing,
  children,
}: {
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-2 pb-1 pt-3 text-caption uppercase tracking-wider text-studio-faint">
      <span>{children}</span>
      {trailing !== undefined ? <span className="tabular-nums">{trailing}</span> : null}
    </div>
  );
}

export function Tooltip({
  label,
  shortcut,
  side = "right",
  children,
}: {
  label: string;
  shortcut?: string;
  side?: "right" | "bottom";
  children: ReactNode;
}) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-[1100] hidden items-center gap-2 whitespace-nowrap rounded-md border border-studio-border-strong bg-studio-elevated px-2 py-1 text-dense text-studio-fg shadow-lg group-hover/tip:flex ${
          side === "right"
            ? "left-full top-1/2 ml-1 -translate-y-1/2"
            : "left-1/2 top-full mt-1 -translate-x-1/2"
        }`}
      >
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </span>
    </span>
  );
}
