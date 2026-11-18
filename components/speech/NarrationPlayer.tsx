"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { cycleRate, pause, RATE_LABEL, resume, skip, stop, useNarrator } from "./narrator";
import { SoundBars } from "./ListenButton";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Floating controls while something is read aloud. Sits above the phone tab
 * bar, follows the part being read on the page, and stops on navigation.
 * Phones get two rows (title, then controls) so the title stays readable.
 */
export function NarrationPlayer() {
  const n = useNarrator();
  const pathname = usePathname();

  // leaving the page ends the reading
  useEffect(() => stop, [pathname]);

  // keep the part being read in view, and open a folded card so its text shows
  useEffect(() => {
    if (!n.partId || n.status !== "playing") return;
    const el = document.querySelector<HTMLElement>(`[data-narration-part="${CSS.escape(n.partId)}"]`);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    const r = el.getBoundingClientRect();
    const visible = r.top >= 64 && r.top <= window.innerHeight * 0.6;
    if (!visible) el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  }, [n.partId, n.status]);

  if (n.status === "idle") return null;
  const playing = n.status === "playing";
  const multi = n.total > 1;

  const close = (
    <button type="button" onClick={stop} aria-label="ปิดการอ่านออกเสียง" className="player-btn">
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  return (
    <>
      {/* room at the end of the page so the controls never cover the last lines */}
      <div className="h-28 sm:h-16" aria-hidden="true" />
      <div
        role="region"
        aria-label="ตัวควบคุมการอ่านออกเสียง"
        className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 px-3 lg:bottom-6 print:hidden"
      >
        <div className="mx-auto flex max-w-xl flex-col rounded-2xl border border-gold/30 bg-navy/95 p-1.5 shadow-glow backdrop-blur-xl sm:flex-row sm:items-center sm:gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-2 pl-2.5">
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="flex items-center gap-2 whitespace-nowrap text-[11px] text-gold">
                {playing ? <SoundBars /> : <Pause className="h-3 w-3" aria-hidden="true" />}
                {playing ? "กำลังอ่าน" : "หยุดชั่วคราว"}
                {multi && (
                  <span className="text-ivory-dim">
                    {n.index + 1}/{n.total}
                  </span>
                )}
              </p>
              <p className="truncate text-sm text-ivory">{n.title}</p>
            </div>
            <span className="sm:hidden">{close}</span>
          </div>

          <div className="flex items-center justify-center gap-3 sm:justify-end sm:gap-1">
            {multi && (
              <button
                type="button"
                onClick={() => skip(-1)}
                disabled={n.index === 0}
                aria-label="หัวข้อก่อนหน้า"
                className="player-btn"
              >
                <SkipBack className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={playing ? pause : resume}
              aria-label={playing ? "หยุดชั่วคราว" : "อ่านต่อ"}
              className="player-btn bg-gold text-midnight hover:bg-gold-light hover:text-midnight"
            >
              {playing ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
            </button>
            {multi && (
              <button
                type="button"
                onClick={() => skip(1)}
                disabled={n.index + 1 >= n.total}
                aria-label="หัวข้อถัดไป"
                className="player-btn"
              >
                <SkipForward className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={cycleRate}
              aria-label={`ความเร็ว ${RATE_LABEL[n.rate]} (กดเพื่อเปลี่ยน)`}
              className="player-btn w-auto min-w-11 px-2.5 text-xs font-medium"
            >
              {RATE_LABEL[n.rate]}
            </button>
            <span className="hidden sm:block">{close}</span>
          </div>
        </div>
      </div>
    </>
  );
}
