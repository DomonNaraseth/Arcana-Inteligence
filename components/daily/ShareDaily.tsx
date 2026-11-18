"use client";

import { useState } from "react";
import { Check, Copy, Download, Loader2, Share2 } from "lucide-react";
import { shareImageUrl, sharePageUrl, type ShareChannel, type SharedDaily } from "@/lib/share";

function countShare(channel: ShareChannel) {
  const body = JSON.stringify({ event: "share", channel });
  try {
    if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
    }
  } catch {
    // counting never interrupts sharing
  }
}

/**
 * Shares today's card as a picture and a link. On phones that can share files
 * it opens the system share sheet with the story image (LINE, Instagram,
 * TikTok…); elsewhere it offers links, copy and download. Nothing personal is
 * in the image or the link.
 */
export function ShareDaily({ shared, cardName }: { shared: SharedDaily; cardName: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const base = typeof window === "undefined" ? "" : window.location.origin;
  const text = `ไพ่ประจำวันของฉันคือ ${cardName} — เปิดไพ่ประจำวันของคุณเองฟรีที่ ARCANA`;
  const link = (channel: ShareChannel) => sharePageUrl(base, shared, channel);
  const storyUrl = shareImageUrl(base, shared, "story");

  async function shareNative() {
    setBusy(true);
    try {
      const res = await fetch(storyUrl);
      if (!res.ok) throw new Error("image");
      const file = new File([await res.blob()], `arcana-${shared.day}.png`, { type: "image/png" });
      const data = { files: [file], text, url: link("native") };
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share(data);
        countShare("native");
        return;
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ text, url: link("native") });
        countShare("native");
        return;
      }
      setOpen(true);
    } catch (err) {
      // the person closed the share sheet: nothing to report
      if ((err as Error).name !== "AbortError") setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    // counted on intent: some browsers refuse clipboard access without telling the page
    countShare("copy");
    try {
      await navigator.clipboard.writeText(link("copy"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const external: { channel: ShareChannel; label: string; href: string }[] = [
    {
      channel: "line",
      label: "LINE",
      href: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(link("line"))}`,
    },
    {
      channel: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link("facebook"))}`,
    },
    {
      channel: "x",
      label: "X",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link("x"))}`,
    },
  ];

  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <button type="button" onClick={() => void shareNative()} disabled={busy} className="btn-ghost px-5 py-2.5 text-sm">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        แชร์ไพ่วันนี้
      </button>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-3 text-sm text-ivory-dim underline-offset-4 hover:text-ivory hover:underline"
        >
          ตัวเลือกอื่น
        </button>
      )}
      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {external.map((e) => (
              <a
                key={e.channel}
                href={e.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => countShare(e.channel)}
                className="btn-quiet border border-white/15"
              >
                {e.label}
              </a>
            ))}
            <button type="button" onClick={() => void copy()} className="btn-quiet border border-white/15">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "คัดลอกลิงก์แล้ว" : "คัดลอกลิงก์"}
            </button>
            <a
              href={storyUrl}
              download={`arcana-${shared.day}.png`}
              onClick={() => countShare("download")}
              className="btn-quiet border border-white/15"
            >
              <Download className="h-4 w-4" /> บันทึกรูปสำหรับสตอรี่
            </a>
          </div>
          <p className="text-xs text-ivory-dim">
            รูปและลิงก์แสดงเฉพาะไพ่และสารประจำวันของไพ่ใบนี้ ไม่มีข้อมูลของคุณ
          </p>
        </div>
      )}
    </div>
  );
}
