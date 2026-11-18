"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, Wand2 } from "lucide-react";
import { ART_STYLES, type ArtStyleId } from "@/lib/oracle/schemas";

const COUNTS = [12, 22, 36, 44, 52] as const;

/** Swatch strip that hints at each ready-made art direction. */
const STYLE_SWATCH: Record<string, string[]> = {
  "gilded-night": ["#101827", "#17263C", "#C6A15B", "#F0E9DA"],
  watercolor: ["#F4D9D0", "#CDE3E1", "#E9E2F4", "#FBEFD5"],
  "thai-mural": ["#7A2E1F", "#C08A3E", "#2F4B3A", "#E8D8B5"],
  botanical: ["#EFE6D2", "#7E8F6A", "#9C6B3F", "#3E4A3A"],
  "celestial-minimal": ["#1B1E4B", "#2B2F6B", "#D9B45A", "#E9E6F5"],
  "ink-wash": ["#F2EFE8", "#2B2B2B", "#8A8A8A", "#B23A2E"],
};

/** Step one of a new deck: the owner's brief. The AI turns it into a concept and a card list (~1 minute). */
export function BriefForm() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [purpose, setPurpose] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [count, setCount] = useState<number>(36);
  const [style, setStyle] = useState<ArtStyleId>("gilded-night");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/oracle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea, purpose, audience, tone, card_count: count, art_style: style, custom_style: custom }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) throw new Error(data?.error?.message ?? "สร้างคอนเซปไม่สำเร็จ กรุณาลองใหม่");
      router.push(`/admin/oracle/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-7 p-6 sm:p-8" aria-labelledby="brief-title">
      <div>
        <p className="eyebrow">ขั้นที่ 1 · บรีฟ</p>
        <h2 id="brief-title" className="mt-2 text-2xl font-semibold">สร้างสำรับใหม่</h2>
        <p className="mt-1 text-sm text-ivory-dim">
          เล่าแนวคิดของสำรับ แล้ว AI จะวางคอนเซป ตั้งชื่อไพ่ทุกใบ และกำหนดแนวภาพให้ คุณแก้ไขได้ทุกจุดก่อนเผยแพร่
        </p>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-ivory">แนวคิดของสำรับ *</span>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={4}
          maxLength={1500}
          required
          minLength={10}
          placeholder="เช่น สำรับไพ่ที่ได้แรงบันดาลใจจากดวงจันทร์และฤดูกาลของไทย ช่วยให้คนทำงานหนักกลับมาฟังใจตัวเอง"
          className="field mt-2 resize-y"
        />
      </label>

      <div className="grid gap-5 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm text-ivory-dim">ใช้เพื่ออะไร</span>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={600} placeholder="เช่น ให้กำลังใจรายวัน" className="field mt-2" />
        </label>
        <label className="block">
          <span className="text-sm text-ivory-dim">สำหรับใคร</span>
          <input value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={300} placeholder="เช่น คนทำงานวัย 25–40" className="field mt-2" />
        </label>
        <label className="block">
          <span className="text-sm text-ivory-dim">น้ำเสียง</span>
          <input value={tone} onChange={(e) => setTone(e.target.value)} maxLength={200} placeholder="เช่น อบอุ่น อ่อนโยน มีพลัง" className="field mt-2" />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ivory">จำนวนไพ่ในสำรับ</legend>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              aria-pressed={count === n}
              className={clsx(
                "min-h-11 rounded-full border px-4 text-sm transition-colors",
                count === n ? "border-gold bg-gold/15 text-gold-light" : "border-white/15 text-ivory-dim hover:border-gold/50",
              )}
            >
              {n} ใบ
            </button>
          ))}
          <label className="ml-1 flex items-center gap-2 text-sm text-ivory-dim">
            หรือ
            <input
              type="number"
              min={8}
              max={78}
              value={count}
              onChange={(e) => setCount(Math.min(78, Math.max(8, Number(e.target.value) || 8)))}
              className="field w-20 py-2 text-center"
              aria-label="จำนวนไพ่ (8–78)"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-ivory-dim">สำรับออราเคิลส่วนใหญ่มี 36–52 ใบ เริ่มจากน้อยก่อนได้ เพิ่มภายหลังไม่ได้</p>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-ivory">แนวภาพ</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ART_STYLES.map((s) => (
            <label
              key={s.id}
              className={clsx(
                "flex cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-gold",
                style === s.id ? "border-gold bg-gold/[0.08]" : "border-white/10 hover:border-gold/40",
              )}
            >
              <input type="radio" name="style" value={s.id} checked={style === s.id} onChange={() => setStyle(s.id)} className="sr-only" />
              <span className="flex h-6 overflow-hidden rounded-md" aria-hidden="true">
                {STYLE_SWATCH[s.id].map((c) => (
                  <span key={c} className="flex-1" style={{ background: c }} />
                ))}
              </span>
              <span className="text-sm text-ivory">{s.th}</span>
            </label>
          ))}
          <label
            className={clsx(
              "flex cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-gold",
              style === "custom" ? "border-gold bg-gold/[0.08]" : "border-white/10 hover:border-gold/40",
            )}
          >
            <input type="radio" name="style" value="custom" checked={style === "custom"} onChange={() => setStyle("custom")} className="sr-only" />
            <span className="flex h-6 items-center justify-center rounded-md border border-dashed border-white/20 text-xs text-ivory-dim">
              กำหนดเอง
            </span>
            <span className="text-sm text-ivory">บรรยายแนวภาพด้วยคำของคุณ</span>
          </label>
        </div>
        {style === "custom" && (
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="เช่น ภาพวาดดิจิทัลโทนชมพู-ทอง ตัวละครหญิงไทยร่วมสมัย แสงยามเช้า"
            className="field mt-3 resize-y"
          />
        )}
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-6">
        <button type="submit" disabled={busy || idea.trim().length < 10} className="btn-gold">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {busy ? "AI กำลังวางคอนเซป…" : "ให้ AI วางคอนเซปสำรับ"}
        </button>
        <p className="text-xs text-ivory-dim" role={busy ? "status" : undefined}>
          {busy
            ? `กำลังตั้งชื่อไพ่ ${count} ใบและกำหนดแนวภาพ ใช้เวลาราว 1–2 นาที อย่าปิดหน้านี้`
            : "ขั้นต่อไป: เขียนเนื้อหาไพ่ทุกใบ → สร้างภาพ → ตรวจ → ไฟล์พิมพ์ → เผยแพร่"}
        </p>
      </div>
    </form>
  );
}
