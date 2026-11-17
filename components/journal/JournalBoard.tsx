"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { JournalRow } from "@/lib/data/readings";
import { formatThaiDate } from "@/lib/format";

export function JournalBoard({ initial }: { initial: JournalRow[] }) {
  const [entries, setEntries] = useState(initial);
  const [open, setOpen] = useState(initial.length === 0);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/journals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "บันทึกไม่สำเร็จ");
      setEntries((prev) => [data.journal as JournalRow, ...prev]);
      setTitle("");
      setContent("");
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("ลบบันทึกนี้ถาวร?")) return;
    const res = await fetch(`/api/journals/${id}`, { method: "DELETE" });
    if (res.ok) setEntries((prev) => prev.filter((x) => x.id !== id));
    else setError("ลบไม่สำเร็จ กรุณาลองใหม่");
  }

  return (
    <div className="mt-8">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-gold">
          <Plus className="h-4 w-4" /> เขียนบันทึกใหม่
        </button>
      ) : (
        <form onSubmit={create} className="panel p-6">
          <label htmlFor="j-title" className="text-sm text-ivory-dim">
            หัวข้อ
          </label>
          <input
            id="j-title"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 200))}
            className="field mt-1"
            placeholder="เช่น ความคิดหลังอ่านไพ่เรื่องงาน"
          />
          <label htmlFor="j-content" className="mt-4 block text-sm text-ivory-dim">
            เนื้อหา
          </label>
          <textarea
            id="j-content"
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 8000))}
            rows={5}
            className="field mt-1 resize-none"
            placeholder="เขียนสิ่งที่อยู่ในใจ…"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={busy || !title.trim() || !content.trim()} className="btn-gold px-5 py-2.5 text-sm">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก
            </button>
            {entries.length > 0 && (
              <button type="button" onClick={() => setOpen(false)} className="btn-quiet">
                ยกเลิก
              </button>
            )}
          </div>
        </form>
      )}

      {entries.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center text-ivory-dim">
          ยังไม่มีบันทึก — เริ่มเขียนบันทึกแรกของคุณด้านบน หรือบันทึกจากหน้าคำอ่านไพ่
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {entries.map((j) => (
            <li key={j.id} className="panel p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-ivory-dim">
                    {formatThaiDate(j.created_at, true)}
                    {j.mood && <span className="chip">{j.mood}</span>}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-ivory">{j.title}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(j.id)}
                  aria-label={`ลบบันทึก ${j.title}`}
                  className="rounded-full p-2 text-ivory-dim/60 hover:bg-white/5 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-[1.85] text-ivory/90">{j.content}</p>
              {j.reading_id && (
                <Link href={`/reading/${j.reading_id}`} className="mt-4 inline-block text-sm text-gold hover:text-gold-light">
                  ดูคำอ่านไพ่ที่เกี่ยวข้อง →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
