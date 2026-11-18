"use client";

import { useState } from "react";
import { Loader2, ShoppingBag } from "lucide-react";

interface Package {
  id: string;
  name: string;
  credits: number;
  price_thb: number;
}

export function BuyCredits({
  packages,
  available,
  testMode,
  needsAccount,
  isGuest,
  via = "stripe",
}: {
  packages: Package[];
  /** a payment provider is configured */
  available: boolean;
  testMode: boolean;
  /** purchases require a signed-in account and the visitor is a guest */
  needsAccount: boolean;
  isGuest: boolean;
  /** how the customer pays: a hosted card checkout, or a PromptPay transfer */
  via?: "stripe" | "promptpay";
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(packageId: string) {
    setBusy(packageId);
    setError(null);
    try {
      const res = await fetch(via === "promptpay" ? "/api/billing/promptpay" : "/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        throw new Error(data?.error?.message ?? "เริ่มการชำระเงินไม่สำเร็จ กรุณาลองใหม่");
      }
      // the hosted checkout, or our own PromptPay payment page
      window.location.assign(data.url as string);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const canBuy = available && !needsAccount;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-gold">แพ็กเกจเติมเครดิต</h3>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {packages.map((p) => (
          <li key={p.id} className="flex flex-col rounded-xl border border-white/10 px-4 py-4">
            <p className="font-medium text-ivory">{p.name}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gold-light">
              {p.credits}
              <span className="ml-1.5 text-sm font-normal text-ivory-dim">เครดิต</span>
            </p>
            <p className="text-sm text-ivory-dim">
              {p.price_thb.toLocaleString("th-TH")} บาท
              <span className="ml-1 text-xs">
                (≈ {(p.price_thb / p.credits).toFixed(2)} บาท/เครดิต)
              </span>
            </p>
            {canBuy && (
              <button
                type="button"
                onClick={() => void buy(p.id)}
                disabled={busy !== null}
                className="btn-gold mt-4 w-full px-4 py-2 text-sm"
              >
                {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
                ซื้อแพ็กเกจนี้
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {!available ? (
        <p className="mt-3 text-xs text-ivory-dim">
          การซื้อเครดิตออนไลน์ยังไม่เปิดให้บริการ (ยังไม่ได้ตั้งค่าระบบชำระเงิน)
        </p>
      ) : needsAccount ? (
        <p className="mt-3 text-sm text-amber-200">
          กรุณาเข้าสู่ระบบด้านล่างก่อนซื้อเครดิต เพื่อให้เครดิตผูกกับบัญชีของคุณ
        </p>
      ) : (
        <p className="mt-3 text-xs text-ivory-dim">
          {via === "promptpay"
            ? "ชำระด้วยการโอนผ่าน PromptPay แล้วส่งสลิป — เครดิตเข้าเมื่อตรวจสลิปผ่าน"
            : "ชำระเงินบนหน้าที่ปลอดภัยของ Stripe — ARCANA ไม่เห็นและไม่เก็บข้อมูลบัตรของคุณ เครดิตจะเข้าทันทีเมื่อการชำระเงินสำเร็จ"}
          {testMode && " · ขณะนี้เป็นโหมดทดสอบ ยังไม่มีการตัดเงินจริง"}
          {isGuest &&
            " · คุณกำลังใช้งานแบบผู้เยี่ยมชม เครดิตจะผูกกับเบราว์เซอร์นี้ แนะนำให้เข้าสู่ระบบเพื่อย้ายเครดิตเข้าบัญชี"}
        </p>
      )}
    </div>
  );
}
