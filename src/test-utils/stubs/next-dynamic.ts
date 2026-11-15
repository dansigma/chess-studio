import type { ComponentType } from "react";

/** Test stub for `next/dynamic`: the lazily loaded component renders nothing. */
export default function dynamic(): ComponentType<never> {
  return () => null;
}
