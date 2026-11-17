"use client";

import { useState } from "react";
import Link from "next/link";
import { BookHeart, Check, Loader2 } from "lucide-react";

const MOODS = ["สงบ", "มีความหวัง", "โล่งใจ", "สับสน", "กังวล", "มุ่งมั่น"];

export function JournalQuick({ readingId, defaultTitle }: { readingId: string; defaultTitle: string }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!content.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/journals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: defaultTitle.slice(0, 200),
          content: content.trim(),
          mood,
          readingId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "บันทึกไม่สำเร็จ");
      }
      setSaved(true);
      setContent("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="flex items-center gap-2 text-sm text-ivory">
          <Check className="h-4 w-4 text-gold" /> บันทึกลงสมุดบันทึกแล้ว
        </p>
        <div className="flex gap-4 text-sm">
          <button type="button" onClick={() => setSaved(false)} className="text-ivory-dim hover:text-ivory">
            เขียนเพิ่ม
          </button>
          <Link href="/journal" className="text-gold hover:text-gold-light">
            เปิดสมุดบันทึก →
          </Link>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost w-full sm:w-auto">
        <BookHeart className="h-4 w-4" /> บันทึกความรู้สึกต่อคำอ่านนี้
      </button>
    );
  }

  return (
    <section className="panel p-6" aria-labelledby="journal-quick-title">
      <h2 id="journal-quick-title" className="text-xl font-semibold">
        บันทึกความรู้สึก
      </h2>
      <p className="mt-1 text-sm text-ivory-dim">
        คำอ่านนี้ทำให้คุณคิดถึงอะไร? การจดไว้ช่วยให้เห็นรูปแบบของตัวเองเมื่อย้อนกลับมาอ่าน
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="ความรู้สึกตอนนี้">
        {MOODS.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mood === m}
            onClick={() => setMood(mood === m ? null : m)}
            className={
              mood === m
                ? "rounded-full border border-gold bg-gold/15 px-3 py-1.5 text-sm text-gold-light"
                : "rounded-full border border-white/15 px-3 py-1.5 text-sm text-ivory-dim hover:border-gold/40"
            }
          >
            {m}
          </button>
        ))}
      </div>
      <label htmlFor="journal-quick" className="sr-only">
        เนื้อหาบันทึก
      </label>
      <textarea
        id="journal-quick"
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, 8000))}
        rows={4}
        placeholder="เขียนสิ่งที่อยู่ในใจ…"
        className="field mt-4 resize-none"
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={() => void save()} disabled={busy || !content.trim()} className="btn-gold px-5 py-2.5 text-sm">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} บันทึก
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-quiet">
          ยกเลิก
        </button>
      </div>
    </section>
  );
}
