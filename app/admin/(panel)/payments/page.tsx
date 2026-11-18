import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { BarList } from "@/components/admin/BarList";
import { NotifyTest } from "@/components/admin/NotifyTest";
import { SlipOkCheck } from "@/components/admin/SlipOkCheck";
import { beamConfig } from "@/lib/billing/beam";
import { PaymentReview } from "@/components/admin/PaymentReview";
import { PaymentWatcher } from "@/components/admin/PaymentWatcher";
import { normalizePromptPayId } from "@/lib/billing/promptpay";
import { slipVerifier } from "@/lib/billing/slip";
import { summarizeWaiting } from "@/lib/billing/watch";
import { requireAdminPage } from "@/lib/admin";
import { billingStatus, formatThb } from "@/lib/billing/provider";
import { formatThaiDate } from "@/lib/format";
import { notifyChannels } from "@/lib/notify";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "การชำระเงิน" };

interface PaymentAdminRow {
  id: string;
  ref: string;
  email: string | null;
  package_name: string;
  credits: number;
  amount_minor: number;
  currency: string;
  status: string;
  livemode: boolean;
  provider: string;
  provider_payment_ref: string | null;
  kind?: string;
  claim?: { at: string; note: string } | null;
  created_at: string;
  paid_at: string | null;
}

interface Revenue {
  paid: {
    count: number;
    revenue_minor: number;
    credits_sold: number;
    buyers: number;
    test_count: number;
    test_revenue_minor: number;
  };
  pending: number;
  unsuccessful: number;
  by_package: { key: string; count: number; revenue_minor: number }[];
}

const STATUS_TH: Record<string, string> = {
  pending: "รอชำระเงิน",
  paid: "ชำระแล้ว",
  failed: "ไม่สำเร็จ",
  expired: "หมดเวลา",
  refunded: "คืนเงินแล้ว",
};

const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "charge.refunded",
  "charge.dispute.created",
];

interface SubscriptionAdminRow {
  ref: string;
  email: string | null;
  tier: string;
  status: string;
  source: "admin" | "stripe";
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  active: boolean;
}

const TIER_NAME: Record<string, string> = { basic: "Plus", premium: "Premium", unlimited: "Unlimited" };

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={
          done
            ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-semibold text-midnight"
            : "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/25 text-xs text-ivory-dim"
        }
        aria-hidden="true"
      >
        {done ? "✓" : ""}
      </span>
      <span className={done ? "text-ivory-dim" : "text-ivory"}>
        <span className="sr-only">{done ? "เสร็จแล้ว: " : "ยังไม่ได้ทำ: "}</span>
        {children}
      </span>
    </li>
  );
}

export default async function AdminPaymentsPage() {
  const admin = await requireAdminPage();
  const status = billingStatus();
  const [payments, subscriptions, revenue, settings, h] = await Promise.all([
    admin.supabase.rpc("arcana_admin_payments", { p_limit: 100 }),
    admin.supabase.rpc("arcana_admin_subscriptions", { p_limit: 100 }),
    admin.supabase.rpc("arcana_admin_revenue", { p_days: 30 }),
    getSettings(admin.supabase, { fresh: true }),
    headers(),
  ]);
  const rows = (payments.data ?? []) as PaymentAdminRow[];
  const members = (subscriptions.data ?? []) as SubscriptionAdminRow[];
  const promptpayReady = settings.promptpay.enabled && Boolean(normalizePromptPayId(settings.promptpay.id));
  const autoSlip = Boolean(slipVerifier());
  const beam = beamConfig();
  const channels = notifyChannels();
  const waitingNow = summarizeWaiting(rows);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  // transfers the customer says they made, then recent unpaid ones (they may still be paying)
  const toReview = rows.filter(
    (p) =>
      p.provider === "promptpay" &&
      p.status === "pending" &&
      (p.claim || new Date(p.created_at).getTime() > dayAgo),
  );
  const activeMembers = members.filter((m) => m.active);
  const rev = revenue.data as Revenue | null;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const webhookUrl = `https://${host}/api/billing/webhook`;
  const liveRevenue = rev ? rev.paid.revenue_minor - rev.paid.test_revenue_minor : 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Billing</p>
        <h1 className="mt-2 text-3xl font-semibold">การชำระเงิน</h1>
        <p className="mt-1 text-sm text-ivory-dim">
          ผู้ใช้ชำระเงินบนหน้าของ Stripe เครดิตถูกเพิ่มเมื่อ Stripe ยืนยันการชำระเงินเท่านั้น
          และตรวจยอดเงินกับสกุลเงินซ้ำก่อนเพิ่มเครดิตทุกครั้ง
        </p>
      </div>

      {promptpayReady && (
        <PaymentWatcher initialLatest={waitingNow.latestClaimAt} initialWaiting={waitingNow.waiting} />
      )}

      <section className="panel p-6" aria-labelledby="pp-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="pp-title" className="text-xl font-semibold">
            PromptPay (โอนเข้าบัญชีของคุณโดยตรง)
          </h2>
          {promptpayReady ? (
            <span className="chip">เปิดใช้งาน</span>
          ) : (
            <span className="chip border-amber-400/40 bg-amber-950/30 text-amber-100">ยังไม่ได้ตั้งค่า</span>
          )}
        </div>
        <ol className="mt-5 space-y-3 text-sm">
          <Step done={promptpayReady}>
            ใส่หมายเลข PromptPay และชื่อบัญชี แล้วเปิดใช้งานที่{" "}
            <Link href="/admin/settings" className="text-gold hover:text-gold-light">
              ตั้งค่าระบบ
            </Link>
          </Step>
          <Step done={Boolean(beam?.live && beam.webhookKey)}>
            (จ่ายอัตโนมัติ ไม่ต้องส่งสลิป) สมัคร Beam Checkout แล้วตั้ง{" "}
            <code className="font-mono text-gold-light">BEAM_MERCHANT_ID</code>,{" "}
            <code className="font-mono text-gold-light">BEAM_API_KEY</code>,{" "}
            <code className="font-mono text-gold-light">BEAM_WEBHOOK_KEY</code> และ{" "}
            <code className="font-mono text-gold-light">BEAM_ENV=production</code> ใน Vercel · ตั้ง Webhook ใน Beam ชี้มาที่{" "}
            <code className="break-all font-mono text-gold-light">https://{host}/api/billing/beam/webhook</code> (เลือก charge.succeeded)
            — ลูกค้าสแกน QR จ่ายแล้วเครดิตเข้าเองทันที
            {beam && !beam.live && " · ตอนนี้เป็นคีย์ทดสอบ (Playground): เปิดให้ผู้ดูแลทดลองเท่านั้น"}
            {beam && !beam.webhookKey && " · ยังไม่มี BEAM_WEBHOOK_KEY: ระบบยังตรวจจากหน้าชำระเงินได้ แต่ถ้าลูกค้าปิดหน้าไปก่อนจะต้องรอให้กลับมา"}
          </Step>
          <Step done={autoSlip}>
            (แนะนำ) สมัครบริการตรวจสลิป SlipOK โดยผูกบัญชีเดียวกัน แล้วตั้ง{" "}
            <code className="font-mono text-gold-light">SLIPOK_BRANCH_ID</code> และ{" "}
            <code className="font-mono text-gold-light">SLIPOK_API_KEY</code> ใน Environment Variables ของ Vercel
            — เครดิตจะเข้าอัตโนมัติเมื่อลูกค้าส่งสลิป ถ้ายังไม่ตั้ง คุณต้องกดอนุมัติรายการด้านล่างเอง
          </Step>
          <Step done={settings.credits.enabled}>เปิดใช้ระบบเครดิต</Step>
          <Step done={channels.length > 0}>
            ตั้งค่าการแจ้งเตือนเมื่อมีลูกค้าแจ้งโอน — LINE:{" "}
            <code className="font-mono text-gold-light">LINE_CHANNEL_ACCESS_TOKEN</code> +{" "}
            <code className="font-mono text-gold-light">LINE_ADMIN_USER_ID</code> หรือ Telegram:{" "}
            <code className="font-mono text-gold-light">TELEGRAM_BOT_TOKEN</code> +{" "}
            <code className="font-mono text-gold-light">TELEGRAM_CHAT_ID</code> ใน Environment Variables ของ Vercel
            {channels.length > 0 && ` (ใช้งานอยู่: ${channels.map((c) => (c === "line" ? "LINE" : "Telegram")).join(", ")})`}
          </Step>
        </ol>
        {autoSlip && <SlipOkCheck />}
        {channels.length > 0 && <NotifyTest />}
      </section>

      {toReview.length > 0 && (
        <section className="panel-gold p-6" aria-labelledby="review-title">
          <h2 id="review-title" className="text-xl font-semibold">
            รอตรวจสอบการโอน ({toReview.length})
          </h2>
          <p className="mt-1 text-sm text-ivory-dim">
            ตรวจยอดเงินเข้าในแอปธนาคารก่อนกดอนุมัติทุกครั้ง — การอนุมัติจะเพิ่มเครดิตทันทีและถูกบันทึกใน audit log
          </p>
          <ul className="mt-4 divide-y divide-white/10">
            {toReview.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0 text-sm">
                  <p className="text-ivory">
                    <span className="font-sans text-lg font-semibold tabular-nums text-gold-light">
                      {formatThb(p.amount_minor)}
                    </span>{" "}
                    · {p.package_name} · {p.credits} เครดิต
                    {!p.livemode && <span className="ml-2 text-xs text-ivory-dim">(ทดสอบ)</span>}
                  </p>
                  <p className="text-ivory-dim">
                    {p.email ?? "ผู้เยี่ยมชม"} · <span className="font-mono text-xs">{p.ref}</span> · สร้างเมื่อ{" "}
                    {formatThaiDate(p.created_at, true)}
                  </p>
                  {p.claim ? (
                    <p className="mt-1 text-ivory">
                      <span className="text-gold">ลูกค้าแจ้งโอน:</span> {p.claim.note}{" "}
                      <span className="text-xs text-ivory-dim">({formatThaiDate(p.claim.at, true)})</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-ivory-dim">ลูกค้ายังไม่ได้แจ้งโอนหรือส่งสลิป</p>
                  )}
                </div>
                <PaymentReview paymentId={p.id} summary={`${formatThb(p.amount_minor)} ของ ${p.email ?? p.ref}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel p-6" aria-labelledby="setup-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="setup-title" className="text-xl font-semibold">
            สถานะการเชื่อมต่อ Stripe (บัตร — ใช้ทดสอบเท่านั้น)
          </h2>
          {!status.configured ? (
            <span className="chip border-amber-400/40 bg-amber-950/30 text-amber-100">ยังไม่ได้ตั้งค่า</span>
          ) : status.livemode ? (
            <span className="chip">โหมดจริง (Live)</span>
          ) : (
            <span className="chip border-white/20 bg-white/5 text-ivory">โหมดทดสอบ (Test)</span>
          )}
        </div>

        <ol className="mt-5 space-y-3 text-sm">
          <Step done={status.configured}>
            ตั้งค่า <code className="font-mono text-gold-light">STRIPE_SECRET_KEY</code> ใน Environment Variables ของ
            Vercel แบบ Sensitive — แนะนำให้ใช้ Restricted key ที่ให้สิทธิ์ Checkout Sessions, Products, Customer portal (Write) และ Subscriptions (Read):{" "}
            <code className="font-mono">rk_test_…</code> เพื่อทดสอบก่อน แล้วค่อยเปลี่ยนเป็น{" "}
            <code className="font-mono">rk_live_…</code> (ใช้ <code className="font-mono">sk_…</code> ได้เช่นกัน
            แต่สิทธิ์กว้างกว่าที่ระบบนี้ต้องใช้)
          </Step>
          <Step done={status.webhookConfigured}>
            สร้าง Webhook endpoint ใน Stripe ชี้มาที่{" "}
            <code className="break-all font-mono text-gold-light">{webhookUrl}</code> แล้วนำ signing secret มาตั้งเป็น{" "}
            <code className="font-mono text-gold-light">STRIPE_WEBHOOK_SECRET</code>
          </Step>
          <Step done={settings.credits.enabled}>
            เปิดใช้ระบบเครดิตและตรวจราคาแพ็กเกจที่{" "}
            <Link href="/admin/settings" className="text-gold hover:text-gold-light">
              ตั้งค่าระบบ
            </Link>
          </Step>
        </ol>

        <details className="mt-5 text-sm">
          <summary className="cursor-pointer text-gold hover:text-gold-light">
            เหตุการณ์ (events) ที่ต้องเลือกตอนสร้าง Webhook
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-xs text-ivory-dim">
            {WEBHOOK_EVENTS.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ivory-dim">
            วิธีชำระเงินที่แสดงให้ผู้ใช้ (บัตร, PromptPay ฯลฯ) กำหนดในแดชบอร์ดของ Stripe ไม่ต้องแก้โค้ด
            หลังแก้ Environment Variables ต้อง Redeploy หนึ่งครั้ง
          </p>
        </details>

        {status.configured && !status.webhookConfigured && (
          <p role="alert" className="mt-4 rounded-xl border border-amber-400/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            ยังไม่ได้ตั้งค่า Webhook — การชำระเงินยังใช้ได้ (ระบบยืนยันตอนผู้ใช้กลับมาที่เว็บ)
            แต่ถ้าผู้ใช้ปิดหน้าก่อนกลับมา หรือใช้วิธีชำระเงินที่ยืนยันช้า เครดิตจะไม่เข้าอัตโนมัติ
          </p>
        )}
      </section>

      {rev && (
        <section aria-label="สรุป 30 วัน" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="panel p-5">
            <p className="text-sm text-ivory-dim">รายได้จริง 30 วัน</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-ivory">{formatThb(liveRevenue)}</p>
            <p className="mt-1 text-xs text-ivory-dim">
              {rev.paid.count - rev.paid.test_count} รายการ
              {rev.paid.test_count > 0 && ` · ทดสอบ ${rev.paid.test_count} รายการ (${formatThb(rev.paid.test_revenue_minor)}) ไม่นับ`}
            </p>
          </div>
          <div className="panel p-5">
            <p className="text-sm text-ivory-dim">ผู้ซื้อ</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-ivory">{rev.paid.buyers}</p>
            <p className="mt-1 text-xs text-ivory-dim">ขายเครดิต {rev.paid.credits_sold.toLocaleString("th-TH")}</p>
          </div>
          <div className="panel p-5">
            <p className="text-sm text-ivory-dim">รอชำระเงิน</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-ivory">{rev.pending}</p>
            <p className="mt-1 text-xs text-ivory-dim">เริ่มแล้วแต่ยังไม่จ่าย</p>
          </div>
          <div className="panel p-5">
            <p className="text-sm text-ivory-dim">ไม่สำเร็จ / หมดเวลา</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-ivory">{rev.unsuccessful}</p>
            <p className="mt-1 text-xs text-ivory-dim">ไม่มีการเพิ่มเครดิต</p>
          </div>
        </section>
      )}

      {rev && rev.by_package.length > 0 && (
        <section className="panel p-6" aria-labelledby="pkg-title">
          <h2 id="pkg-title" className="text-xl font-semibold">
            แพ็กเกจที่ขายได้ (30 วัน)
          </h2>
          <div className="mt-5">
            <BarList items={rev.by_package.map((p) => ({ label: p.key, value: p.count }))} unit=" รายการ" />
          </div>
        </section>
      )}

      <section className="panel p-6" aria-labelledby="members-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="members-title" className="text-xl font-semibold">
            สมาชิกรายเดือน
          </h2>
          <span className="chip">ใช้งานอยู่ {activeMembers.length} ราย</span>
        </div>
        {members.length === 0 ? (
          <p className="mt-3 text-sm text-ivory-dim">ยังไม่มีสมาชิกแบบชำระเงินหรือแพ็กเกจที่กำหนดด้วยมือ</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-xs text-ivory-dim">
                <tr>
                  <th className="px-3 py-2 font-normal">ผู้ใช้</th>
                  <th className="px-3 py-2 font-normal">แพ็กเกจ</th>
                  <th className="px-3 py-2 font-normal">ที่มา</th>
                  <th className="px-3 py-2 font-normal">สถานะ</th>
                  <th className="px-3 py-2 font-normal">ใช้ได้ถึง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {members.map((m) => (
                  <tr key={m.ref}>
                    <td className="px-3 py-2.5 text-ivory">
                      {m.email ?? <span className="font-mono text-xs text-ivory-dim">{m.ref}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-ivory">{TIER_NAME[m.tier] ?? m.tier}</td>
                    <td className="px-3 py-2.5 text-ivory-dim">{m.source === "stripe" ? "Stripe" : "กำหนดเอง"}</td>
                    <td className="px-3 py-2.5">
                      {m.active ? (
                        <span className="text-gold-light">
                          {m.cancel_at_period_end ? "ยกเลิกเมื่อครบรอบ" : "ใช้งานอยู่"}
                        </span>
                      ) : (
                        <span className="text-ivory-dim">สิ้นสุดแล้ว</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-ivory-dim">
                      {m.current_period_end ? formatThaiDate(m.current_period_end) : "ไม่กำหนด"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ivory-dim">
          การคืนเงินค่าสมาชิกทำใน Stripe แล้วปรับเครดิตที่เมนูผู้ใช้ — ระบบดึงเครดิตคืนอัตโนมัติเฉพาะการคืนเงินเต็มจำนวนของแพ็กเติมเครดิต
        </p>
      </section>

      <section aria-labelledby="list-title">
        <h2 id="list-title" className="text-xl font-semibold">
          รายการชำระเงินล่าสุด
        </h2>
        {payments.error ? (
          <p role="alert" className="panel mt-4 border-red-400/30 p-6 text-red-200">
            โหลดรายการไม่สำเร็จ กรุณารีเฟรชหน้านี้
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center text-ivory-dim">
            ยังไม่มีรายการชำระเงิน
          </p>
        ) : (
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-ivory-dim">
                <tr className="border-b border-white/10">
                  <th scope="col" className="px-4 py-3 font-medium">เวลา</th>
                  <th scope="col" className="px-4 py-3 font-medium">ผู้ใช้</th>
                  <th scope="col" className="px-4 py-3 font-medium">แพ็กเกจ</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">ยอดเงิน</th>
                  <th scope="col" className="px-4 py-3 font-medium">สถานะ</th>
                  <th scope="col" className="px-4 py-3 font-medium">ช่องทาง / อ้างอิง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ivory-dim">{formatThaiDate(p.created_at, true)}</td>
                    <td className="px-4 py-2.5">
                      <span className="block text-ivory">{p.email ?? "ผู้เยี่ยมชม"}</span>
                      <span className="block font-mono text-xs text-ivory-dim/70">{p.ref}</span>
                    </td>
                    <td className="px-4 py-2.5 text-ivory">
                      {p.package_name}
                      <span className="ml-2 text-xs text-ivory-dim">{p.credits} เครดิต</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ivory">{formatThb(p.amount_minor)}</td>
                    <td className="px-4 py-2.5">
                      <span className={p.status === "paid" ? "text-gold-light" : "text-ivory-dim"}>
                        {STATUS_TH[p.status] ?? p.status}
                      </span>
                      {!p.livemode && <span className="ml-2 text-xs text-ivory-dim">(ทดสอบ)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ivory-dim">
                      {p.provider === "promptpay" ? "PromptPay" : "Stripe"}
                      <span className="block font-mono">{p.provider_payment_ref ?? "–"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ivory-dim">
          การคืนเงิน PromptPay ทำโดยโอนกลับจากแอปธนาคารของคุณ แล้วปรับเครดิตของผู้ใช้ที่หน้า{" "}
          <Link href="/admin/users" className="text-gold hover:text-gold-light">
            ผู้ใช้และเครดิต
          </Link>{" "}
          (การคืนเงินของ PromptPay ไม่ปรับเครดิตอัตโนมัติ)
        </p>
      </section>
    </div>
  );
}
