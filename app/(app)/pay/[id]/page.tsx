import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { headers } from "next/headers";
import { AutoQrPay } from "@/components/billing/AutoQrPay";
import { SlipUpload } from "@/components/billing/SlipUpload";
import { isAdminCaller } from "@/lib/admin";
import { ensureQr, gatewayFor, type GatewayQr } from "@/lib/billing/gateway";
import { formatThb } from "@/lib/billing/provider";
import {
  maskPromptPayId,
  paymentPayload,
  promptPayConfig,
  promptPayQrDataUrl,
} from "@/lib/billing/promptpay";
import { slipVerifier } from "@/lib/billing/slip";
import { formatThaiDate } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getContext } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ชำระเงินด้วย PromptPay", robots: { index: false } };

interface MyPayment {
  id: string;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  provider: string;
  credits: number;
  amount_minor: number;
  package_name: string;
  claimed: boolean;
  created_at: string;
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ via?: string }>;
}) {
  const { id } = await params;
  const { via } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { supabase } = await getContext();
  const [settings, paymentRes] = await Promise.all([
    getSettings(supabase),
    supabase.rpc("arcana_my_payment", { p_id: id }),
  ]);
  const payment = paymentRes.data as MyPayment | null;
  if (!payment || payment.provider !== "promptpay") notFound();

  const amount = formatThb(payment.amount_minor);

  // automatic QR through the gateway when it is on: scan, pay, done — no slip
  const gateway = payment.status === "pending" ? gatewayFor(await isAdminCaller(supabase)) : null;
  let auto: GatewayQr | null = null;
  let autoError = false;
  if (gateway) {
    try {
      const h = await headers();
      const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
      auto = await ensureQr(supabase, gateway, payment, origin);
    } catch (err) {
      console.error("[arcana] gateway QR failed, falling back to transfer:", (err as Error).message);
      autoError = true;
    }
  }

  const config = promptPayConfig(settings);
  const qr =
    !auto && config && payment.status === "pending"
      ? await promptPayQrDataUrl(paymentPayload(config, payment.amount_minor))
      : null;
  const shop = Boolean(config?.merchantQr);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="eyebrow">PromptPay</p>
        <h1 className="mt-3 text-3xl font-semibold">ชำระเงิน</h1>
        <p className="mt-2 text-ivory-dim">
          {payment.package_name} · {payment.credits} เครดิต · สร้างรายการเมื่อ {formatThaiDate(payment.created_at, true)}
        </p>
      </header>

      {payment.status === "paid" ? (
        <section className="panel-gold p-6 sm:p-8" role="status">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-gold" aria-hidden="true" />
            <div>
              <h2 className="text-2xl font-semibold">ชำระเงินสำเร็จ</h2>
              <p className="mt-2 text-ivory">
                {payment.package_name} · <strong>{payment.credits} เครดิต</strong> อยู่ในกระเป๋าของคุณแล้ว
              </p>
              <p className="mt-1 text-sm text-ivory-dim">ขอบคุณที่ใช้ ARCANA — เริ่มถามไพ่ได้เลย</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/ask" className="btn-gold">
                  เริ่มถามไพ่
                </Link>
                <Link href="/account" className="btn-ghost px-5 py-2.5 text-sm">
                  ดูบัญชีของฉัน
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : payment.status !== "pending" ? (
        <section className="panel p-6">
          <p className="text-ivory">รายการนี้ปิดไปแล้ว หากคุณโอนเงินแล้ว กรุณาติดต่อผู้ดูแลพร้อมสลิป</p>
          <Link href="/pricing" className="btn-ghost mt-5 px-5 py-2.5 text-sm">
            เริ่มรายการใหม่
          </Link>
        </section>
      ) : auto ? (
        <AutoQrPay
          paymentId={payment.id}
          initialQr={auto.qr}
          initialExpiresAt={auto.expiresAt}
          amountLabel={amount}
          credits={payment.credits}
          initialMethod={via === "card" ? "card" : "qr"}
        />
      ) : !config || !qr ? (
        <section className="panel border-amber-400/40 p-6 text-amber-100">
          ระบบชำระเงินยังไม่เปิดให้บริการ (Configuration Missing) — ยังไม่ต้องโอนเงิน
        </section>
      ) : (
        <>
          {autoError && (
            <p className="rounded-xl border border-amber-400/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
              ระบบจ่ายอัตโนมัติขัดข้องชั่วคราว — ชำระด้วยการโอนและส่งสลิปด้านล่างได้ตามปกติ
            </p>
          )}
          <section className="panel grid gap-6 p-6 sm:grid-cols-[auto_1fr]" aria-labelledby="step1-title">
            <div className="mx-auto w-56 overflow-hidden rounded-xl bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`QR PromptPay สำหรับโอน ${amount}`} width={480} height={480} className="h-auto w-full" />
            </div>
            <div>
              <h2 id="step1-title" className="text-xl font-semibold">
                1. สแกนด้วยแอปธนาคารแล้วโอน
              </h2>
              <p className="mt-3 font-sans text-4xl font-semibold tabular-nums text-gold-light">{amount}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-ivory-dim">{shop ? "ร้านผู้รับเงิน" : "ชื่อบัญชีผู้รับ"}</dt>
                  <dd className="text-ivory">{config.accountName || settings.business.name || "—"}</dd>
                </div>
                {!shop && config.id && (
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 text-ivory-dim">PromptPay</dt>
                    <dd className="font-mono text-ivory">{maskPromptPayId(config.id)}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-4 text-sm text-ivory-dim">
                {shop
                  ? "QR ระบุยอดเงินไว้แล้ว สแกนแล้วตรวจชื่อร้านในแอปธนาคารให้ตรงกับด้านบนก่อนยืนยัน"
                  : "QR ระบุยอดเงินไว้แล้ว กรุณาตรวจชื่อบัญชีผู้รับในแอปธนาคารให้ตรงกับด้านบนก่อนยืนยัน และโอนให้ตรงยอด"}
              </p>
            </div>
          </section>

          <section className="panel p-6" aria-labelledby="step2-title">
            <h2 id="step2-title" className="text-xl font-semibold">
              2. ส่งหลักฐานการโอน
            </h2>
            <div className="mt-4">
              <SlipUpload paymentId={payment.id} autoVerify={Boolean(slipVerifier())} alreadyClaimed={payment.claimed} />
            </div>
          </section>
        </>
      )}

      <p className="text-xs text-ivory-dim/70">
        ผู้ขาย: {settings.business.name}
        {settings.business.contact_email && ` · ${settings.business.contact_email}`}
        {settings.business.contact_line && ` · LINE ${settings.business.contact_line}`} ·{" "}
        <Link href="/terms" className="underline underline-offset-4">
          ข้อตกลงและนโยบายคืนเงิน
        </Link>
      </p>
    </div>
  );
}
