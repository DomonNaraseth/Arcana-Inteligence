"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

let firstMount = true;

/**
 * The browser's Back button (and the client router) can show this list as it
 * was on an earlier visit — before a deck was created. On every return after
 * the first load, ask the server for the current list.
 */
export function FreshOnReturn() {
  const router = useRouter();
  useEffect(() => {
    if (firstMount) firstMount = false;
    else router.refresh();
    // a page restored whole from the browser's back-forward cache mounts nothing
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [router]);
  return null;
}
