"use client";

import clsx from "clsx";
import { Pause, Play, Volume2 } from "lucide-react";
import type { NarrationPart } from "@/lib/speech/narration";
import { toggle, useNarrator } from "./narrator";

/**
 * Small "ฟัง" button for one section. Renders nothing where the browser has
 * no speech engine (the main "ฟังทั้งหมด" button explains why).
 */
export function ListenButton({
  parts,
  scope,
  label,
  start = 0,
  className,
}: {
  parts: NarrationPart[];
  scope: string;
  /** what is read, for screen readers: "ฟังหัวข้อ{label}" */
  label: string;
  start?: number;
  className?: string;
}) {
  const n = useNarrator();
  if (!n.supported) return null;
  const mine = n.scope === scope && n.status !== "idle";
  const playing = mine && n.status === "playing";
  const Icon = playing ? Pause : mine ? Play : Volume2;

  return (
    <button
      type="button"
      onClick={() => toggle(parts, scope, start)}
      aria-label={playing ? `หยุดอ่าน${label}ชั่วคราว` : mine ? `อ่าน${label}ต่อ` : `ฟัง${label}`}
      aria-pressed={mine}
      className={clsx(
        "inline-flex min-h-11 min-w-11 shrink-0 print:hidden items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
        mine
          ? "border-gold/60 bg-gold/15 text-gold-light"
          : "border-white/10 text-ivory-dim hover:border-gold/40 hover:text-ivory",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span aria-hidden="true">{playing ? "หยุด" : mine ? "ต่อ" : "ฟัง"}</span>
      {playing && <SoundBars />}
    </button>
  );
}

/** Three bars that move while speech plays; still under reduced motion. */
export function SoundBars({ className }: { className?: string }) {
  return (
    <span className={clsx("sound-bars inline-flex h-3 items-end gap-[2px]", className)} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
