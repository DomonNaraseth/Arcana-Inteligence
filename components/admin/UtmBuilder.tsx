"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buildTrackedUrl } from "@/lib/tracking";

const SOURCES = ["facebook", "line", "tiktok", "instagram", "youtube", "google", "x"];
const MEDIUMS = ["social", "cpc", "paid_social", "email", "referral"];

/** Builds a campaign link whose visits show up under its own name in the source table. */
export function UtmBuilder({ base }: { base: string }) {
  const [page, setPage] = useState(`${base}/daily`);
  const [source, setSource] = useState("facebook");
  const [medium, setMedium] = useState("social");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const url = buildTrackedUrl(page, { source, medium, campaign, content });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm text-ivory-dim">หน้าที่จะพาไป</span>
          <select value={page} onChange={(e) => setPage(e.target.value)} className="field mt-1 py-2 text-sm">
            <option value={`${base}/daily`}>ไพ่ประจำวัน (แนะนำสำหรับคนใหม่)</option>
            <option value={`${base}/`}>หน้าแรก</option>
            <option value={`${base}/cards`}>คลังไพ่ 78 ใบ</option>
            <option value={`${base}/pricing`}>แพ็กเกจ</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-ivory-dim">ช่องทาง (source)</span>
          <input list="utm-sources" value={source} onChange={(e) => setSource(e.target.value)} className="field mt-1 py-2 text-sm" />
          <datalist id="utm-sources">
            {SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="text-sm text-ivory-dim">ประเภท (medium)</span>
          <input list="utm-mediums" value={medium} onChange={(e) => setMedium(e.target.value)} className="field mt-1 py-2 text-sm" />
          <datalist id="utm-mediums">
            {MEDIUMS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="text-sm text-ivory-dim">ชื่อแคมเปญ (เช่น launch-nov)</span>
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} className="field mt-1 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-sm text-ivory-dim">ชิ้นงาน (ไม่บังคับ เช่น post-1)</span>
          <input value={content} onChange={(e) => setContent(e.target.value)} className="field mt-1 py-2 text-sm" />
        </label>
      </div>
      {url ? (
        <div className="flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 break-all rounded-xl border border-white/10 bg-midnight/60 px-3 py-2 text-xs text-ivory">
            {url}
          </code>
          <button type="button" onClick={() => void copy()} className="btn-quiet border border-white/15">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-ivory-dim">ใส่ช่องทาง ประเภท และชื่อแคมเปญ เพื่อสร้างลิงก์</p>
      )}
      <p className="text-xs text-ivory-dim">
        ตัวอักษรถูกแปลงเป็นตัวเล็กและไม่มีช่องว่างให้อัตโนมัติ ใช้ชื่อแคมเปญเดิมทุกครั้งที่โพสต์เรื่องเดียวกัน เพื่อให้ตัวเลขรวมกันถูก
      </p>
    </div>
  );
}
