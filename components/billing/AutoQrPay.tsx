"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  Loader2,
  Lock,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

type Phase = "waiting" | "paid";
type Method = "qr" | "card";

const POLL_MS = 3000;

/**
 * Automatic payment for one order through the gateway: scan its PromptPay QR,
 * or pay by card on the gateway's own checkout page. Either way the page asks
 * the server every few seconds and shows the purchase the moment the gateway
 * confirms it — the customer uploads nothing.
 */
export function AutoQrPay({
  paymentId,
  initialQr,
  initialExpiresAt,
  amountLabel,
  credits,
  initialMethod = "qr",
  cardEnabled = true,
}: {
  paymentId: string;
  initialQr: string;
  initialExpiresAt: string;
  amountLabel: string;
  credits: number;
  initialMethod?: Method;
  cardEnabled?: boolean;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>(initialMethod);
  const [qr, setQr] = useState(initialQr);
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);
  // the clock starts in the browser only, so the server render and hydration agree
  const [now, setNow] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<"renew" | "card" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checking = useRef(false);

  const left = now === null ? null : Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  const expired = left === 0;

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

  // keep asking while the customer pays — also after expiry (a late payment still counts)
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
    setBusy("renew");
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
      setBusy(null);
    }
  }

  async function payByCard() {
    setBusy("card");
    setError(null);
    try {
      const res = await fetch("/api/billing/promptpay/card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error?.message ?? "เปิดหน้าชำระด้วยบัตรไม่สำเร็จ กรุณาลองใหม่");
      window.location.assign(data.url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
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
            <p className="mt-1 text-sm text-ivory-dim">ระบบยืนยันการชำระกับผู้ให้บริการให้อัตโนมัติ ไม่ต้องส่งสลิป</p>
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
    <section className="panel overflow-hidden" aria-labelledby="pay-title">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 px-6 pb-5 pt-6 sm:px-8">
        <div>
          <h2 id="pay-title" className="text-xl font-semibold">เลือกวิธีชำระเงิน</h2>
          <p className="mt-1 text-sm text-ivory-dim">ชำระแล้วใช้งานได้ทันที ไม่ต้องส่งสลิป</p>
        </div>
        <p className="font-sans text-3xl font-semibold tabular-nums text-gold-light sm:text-4xl">{amountLabel}</p>
      </header>

      {cardEnabled && (
        <div className="px-6 pt-5 sm:px-8">
          <div role="tablist" aria-label="วิธีชำระเงิน" className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-midnight/50 p-1">
            {(
              [
                ["qr", QrCode, "สแกน QR พร้อมเพย์"],
                ["card", CreditCard, "บัตรเครดิต / เดบิต"],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={method === key}
                onClick={() => setMethod(key)}
                className={clsx(
                  "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold",
                  method === key ? "bg-gold/15 text-gold-light ring-1 ring-gold/50" : "text-ivory-dim hover:text-ivory",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {method === "qr" ? (
        <div role="tabpanel" aria-label="สแกน QR พร้อมเพย์" className="grid gap-8 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
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
              <button type="button" onClick={() => void renew()} disabled={busy !== null} className="btn-gold w-full">
                {busy === "renew" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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
            <ol className="space-y-3 text-sm">
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
                <span>ยืนยันการจ่ายในแอป แล้วกลับมาที่หน้านี้ — เครดิตจะเข้าเองภายในไม่กี่วินาที</span>
              </li>
            </ol>
            <Waiting text={expired ? "QR หมดอายุแล้ว — ถ้าคุณจ่ายไปแล้ว ระบบยังตรวจให้อยู่ หรือสร้าง QR ใหม่" : "กำลังรอการชำระเงิน…"} />
          </div>
        </div>
      ) : (
        <div role="tabpanel" aria-label="บัตรเครดิต / เดบิต" className="grid gap-8 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
          {/* a card, drawn in the brand's own colours — no card brand logos are reproduced */}
          <div
            className="relative mx-auto aspect-[1.586] w-64 overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-br from-navy-light via-navy to-midnight p-5 shadow-card"
            aria-hidden="true"
          >
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gold/10" />
            <div className="h-7 w-10 rounded-md bg-gradient-to-br from-gold-light to-gold opacity-90" />
            <p className="mt-6 font-mono text-sm tracking-[0.25em] text-ivory/80">•••• •••• •••• ••••</p>
            <div className="mt-4 flex items-end justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] text-ivory-dim">ARCANA</span>
              <CreditCard className="h-5 w-5 text-gold" />
            </div>
          </div>

          <div>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                <span>กดปุ่มด้านล่าง ระบบจะพาไปหน้าชำระเงินที่ปลอดภัยของผู้ให้บริการ (Beam)</span>
              </li>
              <li className="flex gap-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                <span>กรอกข้อมูลบัตรบนหน้านั้นเท่านั้น — ข้อมูลบัตรไม่ผ่านและไม่ถูกเก็บในเว็บ ARCANA</span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                <span>ชำระเสร็จ ระบบจะพากลับมาที่หน้านี้ และเพิ่มเครดิตให้อัตโนมัติ</span>
              </li>
            </ol>
            <button type="button" onClick={() => void payByCard()} disabled={busy !== null} className="btn-gold mt-6 w-full sm:w-auto">
              {busy === "card" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              ชำระ {amountLabel} ด้วยบัตร
            </button>
            <p className="mt-3 text-xs text-ivory-dim">รองรับบัตรเครดิตและเดบิตที่ผู้ให้บริการรับ · ธนาคารผู้ออกบัตรอาจขอยืนยันตัวตน (OTP)</p>
            {initialMethod === "card" && <Waiting text="กำลังยืนยันการชำระด้วยบัตร…" />}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mx-6 mb-6 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200 sm:mx-8">
          {error}
        </p>
      )}
    </section>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <p role="status" className="mt-6 flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm text-ivory">
      <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold" />
      </span>
      {text}
    </p>
  );
}
