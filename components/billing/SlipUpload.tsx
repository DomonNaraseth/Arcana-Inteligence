"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, Send, Upload } from "lucide-react";

/** Some banks report a transfer to the network a few minutes late (SlipOK 1009/1010). */
const BANK_DELAY_SECONDS = 120;
const BANK_DELAY_RETRIES = 3;

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
  /** seconds until the slip is sent again by itself, while a bank has not reported the transfer yet */
  const [retryIn, setRetryIn] = useState<number | null>(null);
  const retries = useRef(0);

  // count down, then send the same slip again
  useEffect(() => {
    if (retryIn === null) return;
    if (retryIn <= 0) {
      setRetryIn(null);
      void sendSlip(true);
      return;
    }
    const t = setTimeout(() => setRetryIn((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryIn]);

  async function sendSlip(automatic = false) {
    if (!file || busy) return;
    if (!automatic) retries.current = 0;
    setBusy("slip");
    setError(null);
    setRetryIn(null);
    try {
      const form = new FormData();
      form.append("paymentId", paymentId);
      form.append("slip", file);
      const res = await fetch("/api/billing/promptpay/slip", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.status !== "paid") {
        // the bank has not reported the transfer yet: keep the slip and try again shortly
        if (data?.error?.reason === "bank_delay" && retries.current < BANK_DELAY_RETRIES) {
          retries.current += 1;
          setRetryIn(BANK_DELAY_SECONDS);
          return;
        }
        // automatic checking is not ready: the transfer was reported to the owner for us
        if (data?.error?.reason === "setup" && data.error.claimed) {
          setView({ state: "claimed" });
          router.refresh();
          return;
        }
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
          <button
            type="button"
            onClick={() => void sendSlip()}
            disabled={!file || busy !== null || retryIn !== null}
            className="btn-gold mt-4"
          >
            {busy === "slip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            ส่งสลิปเพื่อรับเครดิต
          </button>
          {retryIn !== null && (
            <p role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm text-ivory">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
              <span>
                ธนาคารของคุณส่งข้อมูลการโอนเข้าระบบช้ากว่าปกติเล็กน้อย — ระบบจะตรวจสลิปเดิมให้อีกครั้งเองใน{" "}
                <strong className="tabular-nums">
                  {Math.floor(retryIn / 60)}:{String(retryIn % 60).padStart(2, "0")}
                </strong>{" "}
                นาที ไม่ต้องส่งใหม่ (ครั้งที่ {retries.current}/{BANK_DELAY_RETRIES})
              </span>
            </p>
          )}
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
