"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Sends one small first-party beacon per page shown. No cookies of its own,
 * no third party: the server files it under the visitor's existing session.
 */
export function Tracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === last.current) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/auth")) return;
    last.current = pathname;
    const body = JSON.stringify({
      path: pathname,
      search: window.location.search,
      referrer: document.referrer,
    });
    try {
      const sent =
        typeof navigator.sendBeacon === "function" &&
        navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      if (!sent) {
        void fetch("/api/track", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      // measurement never interrupts the visitor
    }
  }, [pathname]);

  return null;
}
