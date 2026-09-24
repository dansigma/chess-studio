import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-studio-accent text-studio-accent-fg hover:bg-studio-accent-strong disabled:bg-studio-hover-strong disabled:text-studio-disabled",
  secondary:
    "bg-studio-hover-strong text-studio-fg hover:bg-studio-selected disabled:text-studio-disabled",
  ghost:
    "text-studio-muted hover:bg-studio-hover hover:text-studio-fg disabled:text-studio-disabled disabled:hover:bg-transparent",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-dense",
  md: "h-8 gap-1.5 px-3.5 text-body",
};

export function Button({
  variant = "secondary",
  size = "md",
  block,
  className = "",
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-lg font-medium disabled:cursor-default ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${block ? "w-full" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  shortcut,
  active,
  size = "md",
  className = "",
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  shortcut?: string;
  active?: boolean;
  size?: "sm" | "md";
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      className={`flex shrink-0 items-center justify-center rounded-md text-studio-fg hover:bg-studio-hover-strong disabled:cursor-default disabled:text-studio-disabled disabled:hover:bg-transparent ${
        size === "sm" ? "h-6 w-6" : "h-7 w-7"
      } ${active ? "bg-studio-hover-strong" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
