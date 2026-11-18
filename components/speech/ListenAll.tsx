"use client";

import { Headphones, Pause, Play } from "lucide-react";
import type { NarrationPart } from "@/lib/speech/narration";
import { toggle, useNarrator } from "./narrator";
import { SoundBars } from "./ListenButton";

/** The main "ฟังทั้งหมด" control, with help when the device cannot speak Thai. */
export function ListenAll({
  parts,
  scope,
  label = "ฟังคำอ่านทั้งหมด",
}: {
  parts: NarrationPart[];
  scope: string;
  label?: string;
}) {
  const n = useNarrator();
  const mine = n.scope === scope && n.status !== "idle";
  const playing = mine && n.status === "playing";
  const minutes = Math.max(1, Math.round(parts.reduce((s, p) => s + p.text.length, 0) / 900));

  if (!n.supported) {
    return (
      <p className="text-xs text-ivory-dim/80">
        เบราว์เซอร์นี้ยังอ่านออกเสียงไม่ได้ ลองเปิดด้วย Safari หรือ Chrome รุ่นล่าสุด
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <button
        type="button"
        onClick={() => toggle(parts, scope)}
        aria-pressed={mine}
        className="btn-ghost w-full sm:w-auto"
      >
        {playing ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : mine ? (
          <Play className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Headphones className="h-4 w-4" aria-hidden="true" />
        )}
        {playing ? "หยุดชั่วคราว" : mine ? "ฟังต่อ" : label}
        {playing && <SoundBars className="text-gold" />}
      </button>
      {!mine && <span className="text-center text-xs text-ivory-dim sm:text-left">ประมาณ {minutes} นาที · กดฟังทีละหัวข้อได้</span>}
      {n.voicesLoaded && !n.hasThaiVoice && (
        <p className="text-xs leading-relaxed text-amber-100/90">
          ไม่พบเสียงภาษาไทยในเครื่องนี้ เสียงอาจอ่านไม่ชัด — เพิ่มเสียงไทยได้ที่ iPhone: การตั้งค่า › การช่วยการเข้าถึง ›
          เนื้อหาที่พูด › เสียง · Android: การตั้งค่า › การอ่านออกเสียงข้อความ
        </p>
      )}
    </div>
  );
}
