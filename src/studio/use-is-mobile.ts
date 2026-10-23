"use client";

import { useEffect, useState } from "react";

// SIG-1043: single source for the mobile breakpoint — the studio renders
// its separate single-column layout below 768 px (matchMedia max-width).
export const MOBILE_MAX_WIDTH = 767;

// Pure query builder (unit-testable without a DOM or React).
export function mobileQuery(maxWidth: number = MOBILE_MAX_WIDTH): string {
  return `(max-width: ${maxWidth}px)`;
}

export function useIsMobile(): boolean {
  // False on the server and on the first client render (SSR-safe: no
  // hydration mismatch when the server markup is desktop).
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = mobileQuery();
    const media = window.matchMedia(query);
    const update = () => setIsMobile(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    // Legacy MediaQueryList API (older Safari / test fakes).
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return isMobile;
}
