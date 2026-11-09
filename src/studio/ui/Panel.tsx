import type { ElementType, HTMLAttributes } from "react";

/**
 * Borderless Studio surface: `studio-panel` with the 10px radius used by
 * `SidebarPanel`. Meant to sit on `studio-bg`; pass `as` for semantics
 * (`section`, `ul`) and `className` for padding/layout.
 */
export function Panel({
  as: Component = "div",
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & { as?: ElementType }) {
  return <Component className={`rounded-[10px] bg-studio-panel ${className}`} {...props} />;
}
