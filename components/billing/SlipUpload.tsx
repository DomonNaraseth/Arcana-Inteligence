"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, Send, Upload } from "lucide-react";

type View =
  | { state: "idle" }
  | { state: "paid"; credits: number; balance: number | null }
  | { state: "claimed" };

/**
 * Step two of a PromptPay payment: hand in the proof. With a slip-verification
 * service the slip is checked at once; otherwise (or when it cannot be read)
 * the customer reports the transfer and an admin confirms it.
 */
export function SlipUpload({
  paymentId,
  autoVerify,
  alreadyClaimed,
}: {
  paymentId: string;
  /** a slip-verification service is configured */
  autoVerify: boolean;
  alreadyClaimed: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(alreadyClaimed ? { state: "claimed" } : { state: "idle" });
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"slip" | "claim" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClaim, setShowClaim] = useState(!autoVerify);

  async function sendSlip() {
    if (!file || busy) return;
    setBusy("slip");
    setError(null);
    try {
      const form = new FormData();
      form.append("paymentId", paymentId);
      form.append("slip", file);
      const res = await fetch("/api/billing/promptpay/slip", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.status !== "paid") {
        // offer the manual route whenever the automatic one did not work
        setShowClaim(true);
        throw new Error(data?.error?.message ?? "ตรวจสลิปไม่สำเร็จ กรุณาลองใหม่");
      }
      setView({ state: "paid", credits: data.credits ?? data.credited ?? 0, balance: data.balance ?? null });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function sendClaim() {
    if (busy) return;
    setBusy("claim");
    setError(null);
    try {
      const res = await fetch("/api/billing/promptpay/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId, note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "แจ้งโอนไม่สำเร็จ กรุณาลองใหม่");
      setView({ state: "claimed" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (view.state === "paid") {
    return (
      <p role="status" className="flex items-start gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-4 text-ivory">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
        <span>
          ชำระเงินสำเร็จ — เพิ่ม <strong>{view.credits} เครดิต</strong> เข้ากระเป๋าของคุณแล้ว
          {view.balance !== null && ` · คงเหลือ ${view.balance} เครดิต`}
        </span>
      </p>
    );
  }
  if (view.state === "claimed") {
    return (
      <p role="status" className="flex items-start gap-3 rounded-xl border border-white/15 px-4 py-4 text-ivory">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
        <span>
          ได้รับการแจ้งโอนแล้ว — ผู้ดูแลจะตรวจสอบกับบัญชีธนาคารและเพิ่มเครดิตให้
          กลับมาดูสถานะได้ที่หน้าบัญชีของคุณ
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {autoVerify && (
        <div>
          <label className="block">
            <span className="text-sm text-ivory-dim">ภาพสลิปจากแอปธนาคาร (JPG, PNG หรือ WEBP ไม่เกิน 4 MB)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm text-ivory file:mr-4 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:text-ivory hover:file:bg-white/15"
            />
          </label>
          <button type="button" onClick={() => void sendSlip()} disabled={!file || busy !== null} className="btn-gold mt-4">
            {busy === "slip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            ส่งสลิปเพื่อรับเครดิต
          </button>
          <p className="mt-2 text-xs text-ivory-dim">
            ระบบตรวจสลิปกับเครือข่ายธนาคารโดยอัตโนมัติ และไม่เก็บภาพสลิปของคุณไว้
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {showClaim ? (
        <div className={autoVerify ? "border-t border-white/10 pt-5" : undefined}>
          <label className="block">
            <span className="text-sm text-ivory-dim">
              {autoVerify ? "หรือแจ้งให้ผู้ดูแลตรวจสอบ — " : ""}ระบุเวลาที่โอน ธนาคาร และชื่อบัญชีผู้โอน
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="เช่น โอน 14:32 น. จาก KBank ชื่อ สมชาย ใ."
              className="field mt-2 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void sendClaim()}
            disabled={note.trim().length < 3 || busy !== null}
            className="btn-ghost mt-3 px-5 py-2.5 text-sm"
          >
            {busy === "claim" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            แจ้งโอนแล้ว
          </button>
          <p className="mt-2 text-xs text-ivory-dim">
            เครดิตจะเข้าหลังผู้ดูแลตรวจสอบยอดเข้าบัญชีแล้ว (ไม่ใช่ทันที)
          </p>
        </div>
      ) : (
        <button type="button" onClick={() => setShowClaim(true)} className="text-sm text-gold underline-offset-4 hover:underline">
          ส่งสลิปไม่ได้? แจ้งโอนให้ผู้ดูแลตรวจสอบ
        </button>
      )}
    </div>
  );
}
