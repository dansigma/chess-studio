// `next/link` stand-in for `node --test`: the real `Link` needs the Next
// router context, but component tests only need anchor rendering —
// `href`, `className`, and children pass straight through to an `<a>`.
import { createElement, type AnchorHTMLAttributes, type ReactNode } from "react";

export default function Link({
  href,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
}) {
  return createElement("a", { href, ...props }, children);
}
