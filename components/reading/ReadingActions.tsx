"use client";

import { useState } from "react";
import clsx from "clsx";
import { Bookmark, BookmarkCheck, Loader2, Printer } from "lucide-react";
import { GoogleSignInButton } from "@/components/account/GoogleSignInButton";

/**
 * Keep-this-reading controls: bookmark it, export it as a PDF (via the
 * browser's print dialog), and — for guests — attach it to a Google account.
 */
export function ReadingActions({
  readingId,
  initialSaved,
  isGuest,
  canExport,
}: {
  readingId: string;
  initialSaved: boolean;
  isGuest: boolean;
  /** an interpretation exists, so there is something worth exporting */
  canExport: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/readings/${readingId}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ saved: !saved }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "บันทึกไม่สำเร็จ กรุณาลองใหม่");
      setSaved(Boolean(data.saved));
      setJustSaved(Boolean(data.saved));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function exportPdf() {
    // open every collapsed card section so the printout is complete
    document.querySelectorAll("details").forEach((d) => {
      d.open = true;
    });
    window.print();
  }

  return (
    <section className="panel p-5 print:hidden" aria-label="เก็บการอ่านไพ่นี้">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          aria-pressed={saved}
          className={clsx(saved ? "btn-gold" : "btn-ghost", "px-5 py-2.5 text-sm")}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <BookmarkCheck className="h-4 w-4" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
          {saved ? "บันทึกไว้แล้ว" : "บันทึกการอ่านไพ่นี้"}
        </button>
        {canExport && (
          <button type="button" onClick={exportPdf} className="btn-quiet border border-white/15 px-4 py-2.5">
            <Printer className="h-4 w-4" /> พิมพ์ / บันทึกเป็น PDF
          </button>
        )}
        <p className="text-xs text-ivory-dim" role="status">
          {saved
            ? justSaved
              ? "เพิ่มใน “ที่บันทึกไว้” ของหน้าประวัติแล้ว"
              : "อยู่ใน “ที่บันทึกไว้” ของหน้าประวัติ"
            : "การอ่านไพ่ทุกครั้งอยู่ในหน้าประวัติอยู่แล้ว — กดบันทึกเพื่อปักหมุดรายการที่อยากกลับมาดู"}
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {isGuest && (
        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ivory-dim">
            ตอนนี้การอ่านไพ่นี้ผูกกับเบราว์เซอร์เครื่องนี้เท่านั้น
            เข้าสู่ระบบเพื่อเก็บไว้กับบัญชีและเปิดดูได้จากทุกอุปกรณ์
          </p>
          <GoogleSignInButton className="shrink-0 sm:w-64" />
        </div>
      )}
    </section>
  );
}
