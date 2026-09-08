"use client";

import { useEffect } from "react";

const COOKIE = "spoodly_tz";

/** Keeps a browser IANA timezone cookie so SSR can format times correctly. */
export function TimezoneSync() {
  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!zone) return;
      const maxAge = 60 * 60 * 24 * 365;
      // Keep IANA names readable (America/Los_Angeles). Encoding turns "/" into
      // %2F, which some servers treat as a literal and then reject as a zone.
      document.cookie = `${COOKIE}=${zone};path=/;max-age=${maxAge};samesite=lax`;
    } catch {
      // ignore
    }
  }, []);

  return null;
}
