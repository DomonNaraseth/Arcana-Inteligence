"use client";

import { useState } from "react";
import { BellRing, Loader2 } from "lucide-react";

const CHANNEL_TH: Record<string, string> = { line: "LINE", telegram: "Telegram" };

/** Lets an admin confirm that notices actually arrive on their phone. */
export function NotifyTest() {
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<{ ok: boolean; text: string }[] | null>(null);

  async function send() {
    setBusy(true);
    setLines(null);
    try {
      const res = await fetch("/api/admin/notify-test", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "ส่งข้อความทดสอบไม่สำเร็จ");
      setLines(
        (data.results as { channel: string; ok: boolean; detail: string }[]).map((r) => ({
          ok: r.ok,
          text: r.ok
            ? `${CHANNEL_TH[r.channel] ?? r.channel}: ส่งแล้ว — ตรวจดูที่แอปของคุณ`
            : `${CHANNEL_TH[r.channel] ?? r.channel}: ส่งไม่สำเร็จ (${r.detail})`,
        })),
      );
    } catch (e) {
      setLines([{ ok: false, text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={() => void send()} disabled={busy} className="btn-quiet border border-white/15">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
        ส่งข้อความทดสอบ
      </button>
      {lines && (
        <ul className="mt-2 space-y-1 text-sm" role="status">
          {lines.map((l, i) => (
            <li key={i} className={l.ok ? "text-gold-light" : "text-red-300"}>
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
