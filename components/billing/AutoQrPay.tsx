"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, Download, Loader2, RefreshCw, ScanLine, ShieldCheck, Smartphone } from "lucide-react";

type Phase = "waiting" | "expired" | "paid";

const POLL_MS = 3000;

/**
 * Automatic PromptPay: the gateway's QR for this one payment. The page asks
 * the server every few seconds; the moment the gateway reports the payment,
 * the purchase is granted and shown — the customer uploads nothing.
 */
export function AutoQrPay({
  paymentId,
  initialQr,
  initialExpiresAt,
  amountLabel,
  credits,
}: {
  paymentId: string;
  initialQr: string;
  initialExpiresAt: string;
  amountLabel: string;
  credits: number;
}) {
  const router = useRouter();
  const [qr, setQr] = useState(initialQr);
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);
  // the clock starts in the browser only, so the server render and hydration agree
  const [now, setNow] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [balance, setBalance] = useState<number | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checking = useRef(false);

  const left = now === null ? null : Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  const expired = left === 0;

  // clock
  useEffect(() => {
    if (phase === "paid") return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const check = useCallback(async () => {
    if (checking.current || document.visibilityState !== "visible") return;
    checking.current = true;
    try {
      const res = await fetch(`/api/billing/promptpay/status?id=${paymentId}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (data?.status === "paid") {
        setPhase("paid");
        setBalance(data.balance ?? null);
        router.refresh();
      } else if (data && data.status !== "pending") {
        setError("รายการนี้ปิดไปแล้ว หากคุณชำระเงินแล้ว กรุณาติดต่อผู้ดูแล");
      }
    } catch {
      // offline for a moment: the next tick asks again
    } finally {
      checking.current = false;
    }
  }, [paymentId, router]);

  // ask the server while the customer pays; keep asking a while after expiry (a late payment still counts)
  useEffect(() => {
    if (phase === "paid") return;
    void check();
    const t = setInterval(() => void check(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check, phase]);

  async function renew() {
    setRenewing(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/promptpay/qr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId, renew: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.qr) throw new Error(data?.error?.message ?? "สร้าง QR ใหม่ไม่สำเร็จ กรุณาลองใหม่");
      setQr(data.qr);
      setExpiresAt(data.expiresAt);
      setNow(Date.now());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRenewing(false);
    }
  }

  if (phase === "paid") {
    return (
      <section className="panel-gold p-6 sm:p-8" role="status" aria-live="polite">
        <div className="flex items-start gap-4">
          <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-gold" aria-hidden="true" />
          <div>
            <h2 className="text-2xl font-semibold">ชำระเงินสำเร็จ</h2>
            <p className="mt-2 text-ivory">
              เพิ่ม <strong>{credits} เครดิต</strong> เข้ากระเป๋าของคุณแล้ว
              {balance !== null && ` · คงเหลือ ${balance} เครดิต`}
            </p>
            <p className="mt-1 text-sm text-ivory-dim">ไม่ต้องส่งสลิป ระบบยืนยันกับธนาคารให้อัตโนมัติ</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/ask" className="btn-gold">เริ่มถามไพ่</Link>
              <Link href="/account" className="btn-ghost px-5 py-2.5 text-sm">ดูบัญชีของฉัน</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const mm = left === null ? "–" : Math.floor(left / 60);
  const ss = left === null ? "––" : String(left % 60).padStart(2, "0");

  return (
    <section className="panel overflow-hidden" aria-labelledby="autoqr-title">
      <div className="grid gap-8 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
        <div className="mx-auto flex w-60 flex-col items-center gap-3">
          <div className={clsx("relative w-full rounded-2xl bg-white p-3 shadow-card", expired && "opacity-30")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from the gateway */}
            <img src={qr} alt={`QR PromptPay สำหรับชำระ ${amountLabel}`} className="h-auto w-full" />
          </div>
          {!expired ? (
            <p className="flex items-center gap-2 text-sm text-ivory-dim" aria-live="off">
              QR ใช้ได้อีก <span className="font-mono tabular-nums text-ivory">{mm}:{ss}</span>
            </p>
          ) : (
            <button type="button" onClick={() => void renew()} disabled={renewing} className="btn-gold w-full">
              {renewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              สร้าง QR ใหม่
            </button>
          )}
          {!expired && (
            <a href={qr} download={`arcana-promptpay-${paymentId.slice(0, 8)}.png`} className="btn-quiet w-full border border-white/15 text-sm">
              <Download className="h-4 w-4" aria-hidden="true" /> บันทึกรูป QR
            </a>
          )}
        </div>

        <div>
          <h2 id="autoqr-title" className="text-xl font-semibold">สแกนจ่าย แล้วใช้งานได้ทันที</h2>
          <p className="mt-3 font-sans text-4xl font-semibold tabular-nums text-gold-light">{amountLabel}</p>
          <ol className="mt-5 space-y-3 text-sm">
            <li className="flex gap-3">
              <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
              <span>เปิดแอปธนาคารใดก็ได้ แล้วสแกน QR นี้ — ยอดเงินถูกใส่ไว้ให้แล้ว</span>
            </li>
            <li className="flex gap-3">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
              <span>จ่ายด้วยมือถือเครื่องนี้? กด “บันทึกรูป QR” แล้วในแอปธนาคารเลือกสแกนจากรูปภาพ</span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
              <span>ยืนยันการจ่ายในแอป แล้วกลับมาที่หน้านี้ — เครดิตจะเข้าเองภายในไม่กี่วินาที ไม่ต้องส่งสลิป</span>
            </li>
          </ol>
          <p
            role="status"
            className="mt-6 flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm text-ivory"
          >
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold" />
            </span>
            {expired ? "QR หมดอายุแล้ว — ถ้าคุณจ่ายไปแล้ว ระบบยังตรวจให้อยู่ หรือสร้าง QR ใหม่" : "กำลังรอการชำระเงิน…"}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-200">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
